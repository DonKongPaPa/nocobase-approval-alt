#!/usr/bin/env node
/**
 * Official-demo environment (re)seeder.
 *
 * The public demo resets periodically and changes hostname; run this against a
 * fresh demo to rebuild the comparison fixtures:
 *   node tools/reseed-demo.mjs                         # default new-demo URL
 *   node tools/reseed-demo.mjs --base https://xxx.demo.nocobase.com
 *
 * Idempotent: every fixture is looked up by its stable name/title first and
 * only created when missing, so re-running on a seeded demo is a no-op.
 * End state is written to tools/demo-state.json for later test runs.
 *
 * Fixtures (aligned with local-env regression fixtures, docs/10):
 *   - collection t_ff { title }
 *   - users ff_applicant / ff_appr1 / ff_appr2  (password: NOCOBASE_USER_PASSWORD)
 *   - in-app channel ff_channel
 *   - workflows: FF countersign (negotiation=1 + todo/done notifications),
 *     FF or-sign (negotiation=0), FF sequential (order=true),
 *     FF two-node (appr1 -> appr2 chain)
 */
const DEFAULT_BASE = process.env.NOCOBASE_DEMO_URL ?? '';
const ACCOUNT = 'admin@nocobase.com';
const PASSWORD = process.env.NOCOBASE_ADMIN_PASSWORD ?? '';
const USER_PASSWORD = process.env.NOCOBASE_USER_PASSWORD ?? '';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = (baseIdx > -1 ? args[baseIdx + 1] : DEFAULT_BASE).replace(/\/$/, '');
const API = `${BASE}/api`;

let token = null;
let spaceHeader = {}; // set after space probe

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Authenticator': 'basic',
      'X-Role': 'root',
      ...spaceHeader,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: non-JSON response (${res.status}): ${text.slice(0, 120)}`);
  }
  if (json.errors?.length) {
    const err = new Error(`${method} ${path}: ${json.errors[0].message}`);
    err.payload = json.errors;
    throw err;
  }
  return json.data;
}

const log = (msg) => process.stdout.write(`${msg}\n`);

async function findFirst(path, filter) {
  const qs = new URLSearchParams({ filter: JSON.stringify(filter), pageSize: '1' });
  const rows = await api(`${path}?${qs}`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function main() {
  // 0. sign in
  const signIn = await fetch(`${API}/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  }).then((r) => r.json());
  token = signIn.data?.token;
  if (!token) throw new Error('sign in failed: ' + JSON.stringify(signIn).slice(0, 200));
  log(`signed in as ${ACCOUNT}`);

  // 1. space probe: use team_a when the multi-space plugin exposes it
  try {
    const spaces = await api('spaces:list');
    const teamA = Array.isArray(spaces) && spaces.find((s) => s.name === 'team_a');
    if (teamA) {
      spaceHeader = { 'X-Spaces': 'team_a' };
      log('multi-space detected -> X-Spaces: team_a');
    } else {
      log('multi-space plugin present but no team_a space; proceeding without header');
    }
  } catch {
    log('no spaces:list endpoint (single-space demo); proceeding without header');
  }

  const state = { base: BASE, seededAt: new Date().toISOString(), fixtures: {} };

  // 2. collection t_ff { title }
  let tff = await findFirst('collections:list', { name: 't_ff' });
  if (!tff) {
    tff = await api('collections:create', {
      method: 'POST',
      body: { name: 't_ff', title: 'FF verify', fields: [{ type: 'string', name: 'title', interface: 'input', uiSchema: { title: 'Title' } }] },
    });
    log('collection t_ff created');
  } else {
    log('collection t_ff exists');
  }
  state.fixtures.collectionTff = tff.name;
  // verify the title column is real (a create that 500s here means the column is missing)
  try {
    await api('t_ff:create', { method: 'POST', body: { title: `reseed-probe-${Date.now()}` } });
    log('t_ff.title column writable');
  } catch (e) {
    throw new Error('t_ff.title column missing — demo column sync failed; create it manually. ' + e.message);
  }

  // 3. users
  const users = {};
  for (const [key, username, nickname] of [
    ['applicant', 'ff_applicant', 'FF Applicant'],
    ['appr1', 'ff_appr1', 'FF Approver 1'],
    ['appr2', 'ff_appr2', 'FF Approver 2'],
  ]) {
    let user = await findFirst('users:list', { username });
    if (!user) {
      user = await api('users:create', {
        method: 'POST',
        body: { username, nickname, password: USER_PASSWORD },
      });
      log(`user ${username} created (id ${user.id})`);
    } else {
      log(`user ${username} exists (id ${user.id})`);
    }
    users[key] = user;
    state.fixtures[key] = { id: user.id, username };
  }

  // 4. channel
  let channel = await findFirst('notificationChannels:list', { name: 'ff_channel' });
  if (!channel) {
    channel = await api('notificationChannels:create', {
      method: 'POST',
      body: { name: 'ff_channel', title: 'FF channel', notificationType: 'in-app-message', meta: { editable: true, deletable: true } },
    });
    log('channel ff_channel created');
  } else {
    log('channel ff_channel exists');
  }
  state.fixtures.channel = 'ff_channel';

  const TODO_NOTE = [{ channel: 'ff_channel', templateType: 'custom', template: { title: 'New approval task', content: '* Record: {{approval.dataKey}}\n* Applicant: {{applicant.nickname}}' } }];
  const DONE_NOTE = [{ channel: 'ff_channel', templateType: 'custom', template: { title: 'Approval finished', content: '* Record: {{approval.dataKey}} result {{statusText}}' } }];

  // 5. workflows + approval nodes
  async function upsertWorkflow(title, triggerExtra, nodeConfig) {
    let wf = await findFirst('workflows:list', { title, type: 'approval' });
    if (wf) {
      log(`workflow "${title}" exists (id ${wf.id}, enabled=${wf.enabled})`);
      if (!wf.enabled) {
        await api(`workflows:update?filterByTk=${wf.id}`, { method: 'POST', body: { enabled: true, current: true } });
        log(`  re-enabled`);
      }
      state.fixtures[title] = { id: wf.id };
      return wf;
    }
    wf = await api('workflows:create', {
      method: 'POST',
      body: { title, type: 'approval', config: { mode: 0, collection: 't_ff', centralized: true, ...triggerExtra } },
    });
    await api(`workflows:update?filterByTk=${wf.id}`, { method: 'POST', body: { enabled: true, current: true } });
    const node = await api('flow_nodes:create', {
      method: 'POST',
      body: { workflowId: wf.id, type: 'approval', title: 'Approval', config: nodeConfig },
    });
    log(`workflow "${title}" created (id ${wf.id}, node ${node.id})`);
    state.fixtures[title] = { id: wf.id, nodeId: node.id };
    return wf;
  }

  const baseNode = { assignees: [users.appr1.id, users.appr2.id], order: false, branchMode: false, actions: [2, -1, 1] };
  await upsertWorkflow('FF countersign', { notifications: DONE_NOTE }, { ...baseNode, negotiation: 1, notifications: TODO_NOTE });
  await upsertWorkflow('FF or-sign', { notifications: DONE_NOTE }, { ...baseNode, negotiation: 0 });
  await upsertWorkflow('FF sequential', {}, { ...baseNode, negotiation: 1, order: true });
  // two-node chain: appr1 then appr2
  let twoNode = await findFirst('workflows:list', { title: 'FF two-node', type: 'approval' });
  if (!twoNode) {
    twoNode = await api('workflows:create', {
      method: 'POST',
      body: { title: 'FF two-node', type: 'approval', config: { mode: 0, collection: 't_ff', centralized: true } },
    });
    await api(`workflows:update?filterByTk=${twoNode.id}`, { method: 'POST', body: { enabled: true, current: true } });
    const n1 = await api('flow_nodes:create', {
      method: 'POST',
      body: { workflowId: twoNode.id, type: 'approval', title: 'Level 1', config: { assignees: [users.appr1.id], negotiation: 1, order: false, branchMode: false, actions: [2, -1, 1] } },
    });
    const n2 = await api('flow_nodes:create', {
      method: 'POST',
      body: { workflowId: twoNode.id, type: 'approval', title: 'Level 2', config: { assignees: [users.appr2.id], negotiation: 1, order: false, branchMode: false, actions: [2, -1, 1] } },
    });
    await api(`flow_nodes:update?filterByTk=${n1.id}`, { method: 'POST', body: { downstreamId: n2.id } });
    await api(`flow_nodes:update?filterByTk=${n2.id}`, { method: 'POST', body: { upstreamId: n1.id } });
    log(`workflow "FF two-node" created (id ${twoNode.id}, chain ${n1.id} -> ${n2.id})`);
    state.fixtures['FF two-node'] = { id: twoNode.id, nodeIds: [n1.id, n2.id] };
  } else {
    log(`workflow "FF two-node" exists (id ${twoNode.id})`);
    state.fixtures['FF two-node'] = { id: twoNode.id };
  }

  // 6. smoke: admin submits to FF countersign; expect records for both approvers
  const countersign = state.fixtures['FF countersign'];
  const approval = await api('approvals:create', {
    method: 'POST',
    body: { collectionName: 't_ff', workflowId: countersign.id, status: 2, data: { title: `reseed-smoke-${Date.now()}` } },
  });
  await new Promise((r) => setTimeout(r, 4000));
  const records = await api(`approvalRecords:list?${new URLSearchParams({ filter: JSON.stringify({ approvalId: approval.id }), fields: 'userId,status' })}`);
  const expected = [users.appr1.id, users.appr2.id].sort().join(',');
  const got = records.map((r) => r.userId).sort().join(',');
  if (got !== expected) throw new Error(`smoke failed: expected records for [${expected}], got [${got}]`);
  log(`smoke OK: approval ${approval.id} assigned to users ${got} (both PENDING)`);

  state.fixtures.smokeApprovalId = approval.id;
  const fs = await import('node:fs');
  const outPath = new URL('./demo-state.json', import.meta.url).pathname;
  fs.writeFileSync(outPath, JSON.stringify(state, null, 2) + '\n');
  log(`state written to ${outPath}`);
  log('reseed complete.');
}

main().catch((e) => {
  console.error('RESEED FAILED:', e.message);
  if (e.payload) console.error(JSON.stringify(e.payload));
  process.exit(1);
});
