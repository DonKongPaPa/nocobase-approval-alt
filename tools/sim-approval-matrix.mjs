#!/usr/bin/env node
/**
 * Simulation matrix for the CLONED APPROVAL plugin — composed scenarios beyond
 * the fixed T1-T15 script, executed identically on the official demo and the
 * local clone, compared on approval/records/rounds + core workflow jobs.
 *
 * Actor constraint (probed 2026-10-23 on the reference demo instance): demo member users are
 * blocked by the multi-space wall (approvalRecords 403), so every scenario acts
 * ONLY as root — root-as-assignee is fully executable (202 -> APPROVED probe).
 * Countersign final resolution (both approve) is unobtainable on the demo; such
 * scenarios assert the observable intermediate state instead.
 *
 * Usage:
 *   node tools/sim-approval-matrix.mjs --side demo
 *   node tools/sim-approval-matrix.mjs --side local
 *   node tools/sim-approval-matrix.mjs --diff
 * Output: api-captures/sima-report-<side>.json, api-captures/sima-matrix-diff.json
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
const MODE = args.includes('--diff') ? 'diff' : `side:${arg('side', 'demo')}`;
const DEMO = (arg('demo', process.env.NOCOBASE_DEMO_URL ?? '')).replace(/\/$/, '');
const LOCAL = (arg('local', 'http://127.0.0.1:13800')).replace(/\/$/, '');
const COLLECTION = 't_sima';
const POLL_MS = Number(arg('poll-ms', 20000));

const PROFILES = {
  demo: { base: DEMO, account: 'admin@nocobase.com', password: process.env.NOCOBASE_ADMIN_PASSWORD ?? '', authenticator: 'basic', space: 'team_a' },
  local: { base: LOCAL, account: 'admin', password: process.env.NOCOBASE_LOCAL_ADMIN_PASSWORD ?? '', authenticator: 'local', space: '' },
};

function makeClient(profile) {
  const api = `${profile.base}/api`;
  let token = null;
  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Authenticator': profile.authenticator,
    'X-Data-Source': 'main',
    ...(profile.space ? { 'X-Spaces': profile.space, 'X-Role': 'root' } : {}),
  });
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(`${api}/${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* raw */ }
    return { status: res.status, ok: res.ok && !json?.errors?.length, data: json?.data, errors: json?.errors, text: text.slice(0, 300) };
  };
  return {
    profile, call,
    async signIn() {
      const r = await fetch(`${api}/auth:signIn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Authenticator': profile.authenticator },
        body: JSON.stringify({ account: profile.account, password: profile.password }),
      });
      token = (await r.json())?.data?.token;
      if (!token) throw new Error(`sign-in failed for ${profile.base}`);
    },
  };
}

// ---------------------------------------------------------------- fixtures
const simaUser = 'sima_appr1';
const USER_PASSWORD = process.env.NOCOBASE_USER_PASSWORD ?? '';
// scenario definitions; cfg(n) builds the approval node config (rootId injected at runtime)
const SCENARIOS = [
  { name: 'SIMA1-or-sign', negotiation: 0, assignees: ['root', 'sima'], act: 'approve' },
  { name: 'SIMA2-countersign', negotiation: 1, assignees: ['root', 'sima'], act: 'approve', note: 'demo: intermediate state only (member wall)' },
  { name: 'SIMA3-sequential', negotiation: 1, order: true, assignees: ['root', 'sima'], act: 'approve' },
  { name: 'SIMA4-voting', negotiation: 0.5, assignees: ['root', 'sima'], act: 'approve', note: 'T14 threshold closure: 1/2 votes vs ratio 0.5' },
  { name: 'SIMA5-reject', negotiation: 0, assignees: ['root'], act: 'reject' },
  { name: 'SIMA6-return-resubmit', negotiation: 0, assignees: ['root'], act: 'return-resubmit' },
  { name: 'SIMA7-withdraw', negotiation: 0, assignees: ['root'], act: 'withdraw', withdrawable: true },
  { name: 'SIMA8-delegate', negotiation: 0, assignees: ['root'], act: 'delegate', toDelegateReassignees: ['sima'], extraActions: [8] },
  { name: 'SIMA9-add', negotiation: 0, assignees: ['root'], act: 'add', toAddReassignees: ['sima'], extraActions: [99] },
  { name: 'SIMA10-branch-end-reject', negotiation: 0, assignees: ['root'], act: 'reject', branchMode: true, endOnReject: true },
  { name: 'SIMA11-filter-assignees', negotiation: 0, assignees: ['root'], act: 'approve', filterAssignees: true },
  { name: 'SIMA12-variable-assignees', negotiation: 0, assignees: ['root'], act: 'approve', variableAssignees: true },
  { name: 'SIMA13-return-to-node', negotiation: 0, assignees: ['root'], act: 'return-to-node', chain: true },
];

async function ensureFixtures(client) {
  // collection
  let c = await client.call(`collections:list?filter=${encodeURIComponent(JSON.stringify({ name: COLLECTION }))}&pageSize=1`);
  const row = Array.isArray(c.data) ? c.data[0] : c.data?.rows?.[0];
  if (!row) {
    await client.call('collections:create', { method: 'POST', body: { name: COLLECTION, title: COLLECTION, createdBy: true, updatedBy: true, fields: [{ name: 'title', interface: 'input', type: 'string', title: 'Title' }] } });
  }
  // helper approver user (receives assignments; never acts — demo member wall)
  const u = await client.call(`users:list?filter=${encodeURIComponent(JSON.stringify({ username: simaUser }))}&pageSize=1`);
  const urow = Array.isArray(u.data) ? u.data[0] : u.data?.rows?.[0];
  if (!urow) await client.call('users:create', { method: 'POST', body: { username: simaUser, nickname: 'SIMA Approver', password: USER_PASSWORD } });
  const u2 = await client.call(`users:list?filter=${encodeURIComponent(JSON.stringify({ username: simaUser }))}&pageSize=1`);
  const userId = (Array.isArray(u2.data) ? u2.data[0] : u2.data?.rows?.[0]).id;

  // root id = the authenticated identity (auth:check), never a username guess —
  // demo root is 'nocobase', local fork root is 'admin'
  const me = await client.call('auth:check');
  const rootId = me.data?.id;
  console.error(`[fixtures] auth:check status=${me.status} ok=${me.ok} rootId=${rootId} errors=${JSON.stringify(me.errors ?? null)?.slice(0, 120)}`);
  const resolve = (name) => (name === 'root' ? rootId : name === 'sima' ? userId : null);
  return { rootId, userId, resolve };
}

function buildNodeConfig(spec, resolve) {
  const assignees = spec.filterAssignees
    ? [{ $and: [{ id: { $eq: resolve('root') } }] }]
    : spec.variableAssignees
      ? ['{{$context.data.createdById}}']
      : spec.assignees.map(resolve);
  return {
    assignees,
    negotiation: spec.negotiation,
    order: spec.order ?? false,
    branchMode: spec.branchMode ?? false,
    actions: [2, -1, 1, ...(spec.extraActions ?? [])],
    ...(spec.endOnReject ? { endOnReject: true } : {}),
    ...(spec.toDelegateReassignees ? { toDelegateReassignees: spec.toDelegateReassignees.map(resolve) } : {}),
    ...(spec.toAddReassignees ? { toAddReassignees: spec.toAddReassignees.map(resolve) } : {}),
  };
}

async function ensureWorkflow(client, spec, resolve, recreate = false) {
  const found = await client.call(`workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: spec.name, type: 'approval' }))}&pageSize=1`);
  let wf = Array.isArray(found.data) ? found.data[0] : found.data?.rows?.[0];
  if (wf && recreate) {
    // nodes lock after executions — stale configs from earlier runs can only be
    // fixed by destroy + fresh create
    await client.call(`workflows:destroy?filterByTk=${wf.id}`, { method: 'POST' });
    console.error(`  [recreate] destroyed "${spec.name}" (${wf.id})`);
    wf = null;
  }
  if (!wf) {
    wf = await client.call('workflows:create', { method: 'POST', body: { title: spec.name, type: 'approval', config: { collection: COLLECTION, mode: 0, centralized: true, ...(spec.withdrawable ? { withdrawable: true } : {}) } } }).then((r) => r.data);
  }
  const full = await client.call(`workflows:get?filterByTk=${wf.id}&appends%5B%5D=nodes`);
  let nodes = full.data?.nodes ?? [];
  const cfg = buildNodeConfig(spec, resolve);
  const ensureNode = async (title) => {
    let n = nodes.find((x) => x.title === title);
    if (!n) {
      n = await client.call('flow_nodes:create', { method: 'POST', body: { workflowId: wf.id, type: 'approval', title, config: cfg, upstreamId: nodes.length ? nodes[nodes.length - 1].id : null } }).then((r) => r.data);
      if (nodes.length) await client.call(`flow_nodes:update?filterByTk=${nodes[nodes.length - 1].id}`, { method: 'POST', body: { downstreamId: n.id } });
      nodes.push(n);
    }
    return n;
  };
  const n1 = await ensureNode('L1');
  let n2 = null;
  if (spec.chain) n2 = await ensureNode('L2');
  if (wf.enabled !== true) await client.call(`workflows:update?filterByTk=${wf.id}`, { method: 'POST', body: { enabled: true, current: true } });
  return { wf, n1, n2 };
}

const hydrateJobs = async (client, exec) => {
  for (const j of exec.jobs ?? []) {
    if (j.result === undefined && j.meta === undefined) {
      const rec = await client.call(`jobs:get?filterByTk=${j.id}`).catch(() => null);
      if (rec?.data) { j.result = rec.data.result ?? null; j.meta = rec.data.meta ?? null; }
    }
  }
  return exec;
};

const PENDING = new Set([null, 0]);
async function waitFor(fn, { timeoutMs = POLL_MS, interval = 1200 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  return last;
}

// ---------------------------------------------------------------- evidence
const shape = (v, depth = 0) => {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => shape(x, depth + 1));
  if (typeof v === 'object') {
    if (depth > 3) return '{…}';
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, shape(val, depth + 1)]));
  }
  if (typeof v === 'number' && v > 1e10) return '<bigId>';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return '<isoDate>';
  if (typeof v === 'string' && /^\d{10,}$/.test(v)) return '<numStringId>';
  if (typeof v === 'string' && /-\d{10,}$/.test(v)) return '<recordTitle>';
  return v;
};

async function collectApproval(client, approvalId, workflowId, execMarker, resolve) {
  const label = (id) => (Number(id) === Number(resolve('root')) ? 'root' : Number(id) === Number(resolve('sima')) ? 'sima' : `u${id}`);
  const ap = await client.call(`approvals:list?filter=${encodeURIComponent(JSON.stringify({ id: approvalId }))}&fields=id,status,data`).then((r) => (Array.isArray(r.data) ? r.data[0] : r.data?.rows?.[0]));
  const recs = await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId }))}&fields=id,userId,status`).then((r) => (Array.isArray(r.data) ? r.data : r.data?.rows || []));
  const rounds = await client.call(`approvalExecutions:list?filter=${encodeURIComponent(JSON.stringify({ approvalId }))}&fields=id,status,round`).then((r) => (Array.isArray(r.data) ? r.data : r.data?.rows || []));
  const execs = await client.call(`executions:list?filter=${encodeURIComponent(JSON.stringify({ workflowId }))}&sort=-id&pageSize=20`);
  const execRows = (Array.isArray(execs.data) ? execs.data : execs.data?.rows || [])
    .filter((e) => Number(e.id) > Number(execMarker ?? 0));
  // per-instance volatiles inside job payloads: business record ids and user ids
  const normResult = (result) => {
    if (!result || typeof result !== 'object') return shape(result ?? null);
    const out = { status: result.status ?? null };
    if (result.data && typeof result.data === 'object') {
      // shape() every field (titles carry per-run timestamps) except the id,
      // which is a small sequential value shape() would keep verbatim
      out.data = {};
      for (const [k, v] of Object.entries(result.data)) out[k] = k === 'id' ? '<recordId>' : shape(v);
    } else if (result.data !== undefined) out.data = shape(result.data ?? null);
    if (result.records !== undefined) {
      out.records = (result.records ?? []).map((r) => ({
        id: '<recordId>',
        status: r.status,
        userId: label(r.userId),
        comment: shape(r.comment ?? null),
        ...(r.updatedAt !== undefined ? { updatedAt: shape(r.updatedAt) } : {}),
      }));
    }
    for (const k of Object.keys(result)) {
      if (!['status', 'data', 'records'].includes(k)) out[k] = shape(result[k]);
    }
    return out;
  };
  const jobs = [];
  for (const e of execRows.slice(0, 3)) {
    const full = await client.call(`executions:get?filterByTk=${e.id}&appends%5B%5D=jobs`).then((r) => r.data).then((d) => hydrateJobs(client, d)).catch(() => null);
    if (full) jobs.push({ status: full.status, jobs: (full.jobs ?? []).map((j) => ({ status: j.status, result: normResult(j.result ?? null) })) });
  }
  return {
    approval: { status: ap?.status ?? null },
    records: recs.map((r) => ({ userId: label(r.userId), status: r.status })).sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : a.status - b.status)),
    rounds: rounds.map((r) => ({ status: r.status, round: r.round })).sort((a, b) => a.round - b.round),
    executions: jobs.sort((a, b) => a.status - b.status),
  };
}

// ---------------------------------------------------------------- scenarios
async function runSide(sideName) {
  const client = makeClient(PROFILES[sideName]);
  await client.signIn();
  console.error(`[${sideName}] signed in`);
  const RE = args.includes('--recreate');
  const { resolve } = await ensureFixtures(client);
  const report = { side: sideName, base: client.profile.base, scenarios: {} };

  for (const spec of SCENARIOS) {
    const { wf, n1, n2 } = await ensureWorkflow(client, spec, resolve, RE);
    const entry = { errors: [] };

    // fire (executions marker prevents cross-run pollution in collections)
    const before = await client.call(`executions:list?filter=${encodeURIComponent(JSON.stringify({ workflowId: wf.id }))}&sort=-id&pageSize=1`);
    const execMarker = (Array.isArray(before.data) ? before.data[0] : before.data?.rows?.[0])?.id ?? 0;
    const ap = await client.call('approvals:create', { method: 'POST', body: { collectionName: COLLECTION, workflowId: wf.id, status: 2, data: { title: `${spec.name}-${Date.now()}` } } });
    if (!ap.ok) { report.scenarios[spec.name] = { errors: ['create failed: ' + ap.text] }; continue; }
    const approvalId = ap.data.id;
    const recs = (await waitFor(async () => {
      const r = await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId }))}&fields=id,userId,status`);
      const rows = Array.isArray(r.data) ? r.data : r.data?.rows || [];
      return rows.length ? rows : null;
    })) || [];
    const myRecord = recs.find((r) => r.userId === resolve('root'));
    entry.created = { approvalId: '<id>', records: recs.map((r) => ({ userId: r.userId === resolve('root') ? 'root' : 'sima', status: r.status })) };
    if (!myRecord) {
      // no root record to act on (e.g. assignee-form resolution differences) —
      // evidence-only scenario entry, this IS the finding
      await new Promise((r) => setTimeout(r, 4000));
      entry.evidence = await collectApproval(client, approvalId, wf.id, execMarker, resolve);
      entry.errors.push('no root record found for acting');
      report.scenarios[spec.name] = entry;
      console.error(`[${sideName}] ${spec.name}: NO ROOT RECORD — evidence only (${JSON.stringify(entry.evidence.records)})`);
      continue;
    }

    // act as root
    const submit = async (body, path = 'submit') => client.call(`approvalRecords:${path}?filterByTk=${myRecord.id}`, { method: 'POST', body });
    if (spec.act === 'approve' || spec.act === 'reject') {
      const r = await submit({ status: spec.act === 'approve' ? 2 : -1, comment: `${spec.name} act`, data: {} });
      if (!r.ok) entry.errors.push(`act: ${r.status} ${r.text}`);
    } else if (spec.act === 'return-resubmit') {
      // The official client routes 退回 through the dedicated :return action —
      // approvalRecords:submit rejects status 1 (browser sim S4, 2026-10-23:
      // the old form here POSTed status 1 to :submit, both sides' end states
      // coincided at APPROVED, and the return step itself was never compared).
      // Assert the intermediate RETURNED(1) before resubmitting.
      const r = await submit({ status: 1, comment: 'return it', data: {} }, 'return');
      if (!r.ok) entry.errors.push(`return: ${r.status} ${r.text}`);
      // NOTE: no &fields= here — the demo host 500s on approvals:get+fields
      // ("Data source not found"), another instance of the fields-param quirk.
      const returnedOk = await waitFor(async () => {
        const r2 = await client.call(`approvals:get?filterByTk=${approvalId}`);
        const st = Number(Array.isArray(r2.data) ? r2.data[0]?.status : r2.data?.status);
        return st === 1 ? true : null;
      });
      if (!returnedOk) entry.errors.push('return: approval did not reach RETURNED(1)');
      await client.call(`approvals:update?filterByTk=${approvalId}`, { method: 'POST', body: { status: 2, data: { title: `${spec.name}-round2` } } });
      await waitFor(async () => {
        const r = await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId }))}&fields=id,userId,status,round`);
        const rows = Array.isArray(r.data) ? r.data : r.data?.rows || [];
        const pending = rows.filter((x) => x.status === 0);
        return pending.length ? pending : null;
      });
      const mine2 = (await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId, userId: resolve('root'), status: 0 }))}&fields=id`));
      const rows2 = Array.isArray(mine2.data) ? mine2.data : mine2.data?.rows || [];
      if (rows2[0]) await client.call(`approvalRecords:submit?filterByTk=${rows2[0].id}`, { method: 'POST', body: { status: 2, comment: 'round2 approve', data: {} } });
    } else if (spec.act === 'withdraw') {
      await client.call(`approvals:withdraw?filterByTk=${approvalId}`, { method: 'POST', body: {} });
    } else if (spec.act === 'delegate') {
      await submit({ assignee: resolve('sima') }, 'delegate');
    } else if (spec.act === 'add') {
      await submit({ assignee: [resolve('sima')], order: 1 }, 'add');
    } else if (spec.act === 'return-to-node') {
      // advance: approve L1 -> L2 pending -> return to L1 by its node id
      await waitFor(async () => {
        const r = await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId, userId: resolve('root'), status: 0 }))}&fields=id`);
        const rows = Array.isArray(r.data) ? r.data : r.data?.rows || [];
        return rows.length >= 1 ? rows : null;
      });
      const l1 = (await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId, status: 0 }))}&fields=id,userId`));
      const l1rows = Array.isArray(l1.data) ? l1.data : l1.data?.rows || [];
      if (l1rows[0]) {
        await client.call(`approvalRecords:submit?filterByTk=${l1rows[0].id}`, { method: 'POST', body: { status: 2, comment: 'L1 pass', data: {} } });
      }
      await waitFor(async () => {
        const r = await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId, status: 0 }))}&fields=id`);
        const rows = Array.isArray(r.data) ? r.data : r.data?.rows || [];
        return rows.length ? rows : null;
      });
      const l2 = (await client.call(`approvalRecords:list?filter=${encodeURIComponent(JSON.stringify({ approvalId, status: 0 }))}&fields=id`));
      const l2rows = Array.isArray(l2.data) ? l2.data : l2.data?.rows || [];
      if (l2rows[0]) {
        await client.call(`approvalRecords:return?filterByTk=${l2rows[0].id}`, { method: 'POST', body: { status: 1, comment: 'return to L1', data: {}, returnToNodeKey: String(n1.id) } });
      }
    }

    // settle + collect
    await waitFor(async () => {
      const r = await client.call(`approvals:list?filter=${encodeURIComponent(JSON.stringify({ id: approvalId }))}&fields=id,status`);
      const a = Array.isArray(r.data) ? r.data[0] : r.data?.rows?.[0];
      return a && a.status !== 3 ? a : null;
    }, { timeoutMs: spec.name === 'SIMA2-countersign' ? 6000 : POLL_MS }).catch(() => null);
    entry.evidence = await collectApproval(client, approvalId, wf.id, execMarker, resolve);
    report.scenarios[spec.name] = entry;
    console.error(`[${sideName}] ${spec.name}: approval=${entry.evidence.approval.status} records=${JSON.stringify(entry.evidence.records)}${entry.errors.length ? ' ERR=' + entry.errors[0] : ''}`);
  }

  fs.mkdirSync('api-captures', { recursive: true });
  fs.writeFileSync(`api-captures/sima-report-${sideName}.json`, JSON.stringify(report, null, 2));
  console.error(`[${sideName}] report → api-captures/sima-report-${sideName}.json`);
}

// ---------------------------------------------------------------- diff
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (MODE === 'diff') {
  const A = JSON.parse(fs.readFileSync('api-captures/sima-report-demo.json', 'utf8'));
  const B = JSON.parse(fs.readFileSync('api-captures/sima-report-local.json', 'utf8'));
  const scenarios = [];
  const names = new Set([...Object.keys(A.scenarios), ...Object.keys(B.scenarios)]);
  // Conscious deviations (documented, not bugs): official alpha.12 resolves the
  // compiled filter-group assignee form to EMPTY (auto-approve with no records)
  // while the clone keeps resolving it — the user-requested nested-filter
  // capability is retained over matching an apparent upstream regression.
  const ACCEPTED_DEVIATIONS = new Set(['SIMA11-filter-assignees']);
  for (const name of names) {
    const a = A.scenarios[name]?.evidence, b = B.scenarios[name]?.evidence;
    const diffs = [];
    if (!a || !b) diffs.push({ kind: 'missing-side' });
    else {
      for (const k of ['approval', 'records', 'rounds', 'executions']) {
        if (!same(a[k], b[k])) diffs.push({ kind: k, official: a[k], clone: b[k] });
      }
    }
    const deviation = ACCEPTED_DEVIATIONS.has(name) && diffs.length > 0;
    scenarios.push({ name, deviation, diffs });
    console.error(`[${name}] ${deviation ? 'DEVIATION-accepted' : 'diffs=' + diffs.length}`);
  }
  const total = scenarios.reduce((n, s) => n + (s.deviation ? 0 : s.diffs.length), 0);
  fs.writeFileSync('api-captures/sima-matrix-diff.json', JSON.stringify({ demo: DEMO, local: LOCAL, verdict: total === 0 ? 'IDENTICAL' : 'DELTA', totalDiffs: total, scenarios }, null, 2));
  console.log(JSON.stringify({ verdict: total === 0 ? 'IDENTICAL' : 'DELTA', totalDiffs: total, perScenario: scenarios.map((s) => ({ name: s.name, diffs: s.diffs.length })) }, null, 2));
} else {
  await runSide(MODE.split(':')[1]);
}
