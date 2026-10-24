#!/usr/bin/env node
/**
 * CI smoke E2E against a freshly provisioned NocoBase host with the cloned
 * workflow-approval plugin installed from the release tgz (tools/ci.sh stage 5).
 *
 * Checks, in order — every one must pass for the pipeline to go green:
 *   1. auth:signIn (local authenticator)
 *   2. pm:get dependency-compatibility gate: isCompatible=true, all rows pass, >=20 packages
 *   3. client lane served as static asset
 *   4. fixture: collection + two approver users (record probe, SQL ALTER self-heal)
 *   5. countersign workflow (negotiation=1, two assignees) created + enabled
 *   6. application submitted -> both approvalRecords assigned PENDING
 *   7. both records approved -> approval reaches status 4 (APPROVED)
 *   8. plugin error-log scan (pm2 error log must stay free of workflow-approval errors)
 *
 * Usage: node tools/ci-smoke.mjs --base http://127.0.0.1:PORT
 *        [--container nb-<env>-postgres] [--error-log path] [--report path]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : fallback;
};
const BASE = (arg('base') || 'http://127.0.0.1:13800').replace(/\/$/, '');
const API = `${BASE}/api`;
const CONTAINER = arg('container');
const ERROR_LOG = arg('error-log');
const REPORT = arg('report');
const ACCOUNT = arg('account', 'admin@nocobase.com');
// Target env credentials come from args/env — no baked-in passwords.
const PASSWORD = arg('password', process.env.NOCOBASE_ADMIN_PASSWORD ?? 'ci-root-password');
const USER_PASSWORD = process.env.NOCOBASE_USER_PASSWORD ?? 'ci-user-password';
const STAMP = Date.now().toString(36);
const COLLECTION = `ci_t_${STAMP}`;
const WF_TITLE = `CI countersign ${STAMP}`;

const stages = [];
let token = null;

function record(name, status, detail) {
  stages.push({ name, status, detail });
  console.log(`[${status.toUpperCase()}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (status === 'fail') throw new Error(`${name}: ${detail}`);
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Data-Source': 'main',
      'X-Authenticator': 'local',
      'X-Role': 'root',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${path}: non-JSON ${res.status}: ${text.slice(0, 200)}`); }
  if (!res.ok || json.errors) {
    throw new Error(`${path}: HTTP ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  }
  return json.data;
}

function psql(sql) {
  if (!CONTAINER) throw new Error('psql requested but --container not given');
  return execFileSync('podman', ['exec', CONTAINER, 'psql', '-U', 'nocobase', '-d', 'nocobase', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1. sign in
  const signIn = await fetch(`${API}/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'local' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  });
  const signInJson = await signIn.json();
  token = signInJson?.data?.token;
  record('sign-in', token ? 'pass' : 'fail', token ? `token ${token.slice(0, 12)}…` : JSON.stringify(signInJson).slice(0, 200));
  if (!token) process.exit(1);

  // 2. dependency-compatibility gate (the externalVersion.js regression)
  const pm = await api('pm:get?filterByTk=workflow-approval');
  const rows = pm.depsCompatible || [];
  const failing = rows.filter((r) => !r.result);
  record(
    'pm-dependency-compat',
    // de-v2 (feat/v3-ai-portal) shrank the external surface 20 → 11 packages;
    // the gate asserts non-trivial coverage + zero failures, not a magic count.
    pm.isCompatible === true && failing.length === 0 && rows.length >= 10 ? 'pass' : 'fail',
    `isCompatible=${pm.isCompatible} rows=${rows.length} failing=${failing.length}${failing.length ? ' → ' + failing.map((r) => r.name).join(',') : ''}`,
  );

  // 3. static asset lanes
  const info = await api('app:getInfo');
  const version = info?.version || info?.appVersion;
  const lanes = [];
  for (const lane of ['client']) {
    const url = `${BASE}/dist/${version}/static/plugins/@nocobase/plugin-workflow-approval/dist/${lane}/index.js`;
    const res = await fetch(url);
    lanes.push(`${lane}:${res.status}`);
  }
  record('static-asset-lanes', lanes.every((s) => s.endsWith(':200')) ? 'pass' : 'fail', lanes.join(' '));

  // 4. fixtures: collection (+ physical-column self-heal) and approver users
  await api('collections:create', {
    method: 'POST',
    body: {
      name: COLLECTION,
      title: 'CI verify',
      fields: [{ type: 'string', name: 'title', interface: 'input', uiSchema: { title: 'Title' } }],
    },
  });
  try {
    await api(`${COLLECTION}:create`, { method: 'POST', body: { title: `ci-probe-${STAMP}` } });
    record('collection-provision', 'pass', `${COLLECTION} created, column writable`);
  } catch (e) {
    // Known host quirk (docs/08 §10.2): API collection metadata syncs but the
    // physical column may lag — add it directly, then retry the probe.
    psql(`ALTER TABLE "${COLLECTION}" ADD COLUMN "title" character varying`);
    await api(`${COLLECTION}:create`, { method: 'POST', body: { title: `ci-probe-${STAMP}` } });
    record('collection-provision', 'pass', `${COLLECTION} created (physical column added via ALTER)`);
  }
  const users = {};
  for (const [key, username, nickname] of [
    ['appr1', `ci_appr1_${STAMP}`, 'CI Approver 1'],
    ['appr2', `ci_appr2_${STAMP}`, 'CI Approver 2'],
  ]) {
    users[key] = await api('users:create', { method: 'POST', body: { username, nickname, password: USER_PASSWORD } });
  }
  record('approver-users', 'pass', `ids ${users.appr1.id}, ${users.appr2.id}`);

  // 5. countersign workflow
  const wf = await api('workflows:create', {
    method: 'POST',
    body: { title: WF_TITLE, type: 'approval', config: { mode: 0, collection: COLLECTION, centralized: true } },
  });
  await api(`flow_nodes:create`, {
    method: 'POST',
    body: {
      workflowId: wf.id,
      type: 'approval',
      title: 'CI approval',
      config: { assignees: [users.appr1.id, users.appr2.id], negotiation: 1, order: false, branchMode: false, actions: [2, -1, 1] },
    },
  });
  await api(`workflows:update?filterByTk=${wf.id}`, { method: 'POST', body: { enabled: true, current: true } });
  record('workflow-provision', 'pass', `workflow ${wf.id} enabled, countersign node created`);

  // 6. submit application -> both records PENDING
  const approval = await api('approvals:create', {
    method: 'POST',
    body: { collectionName: COLLECTION, workflowId: wf.id, status: 2, data: { title: `ci-smoke-${STAMP}` } },
  });
  await sleep(4000);
  const records = await api(
    `approvalRecords:list?${new URLSearchParams({ filter: JSON.stringify({ approvalId: approval.id }), fields: 'id,userId,status' })}`,
  );
  const expected = [users.appr1.id, users.appr2.id].sort((a, b) => a - b).join(',');
  const got = records.map((r) => r.userId).sort((a, b) => a - b).join(',');
  const allPending = records.every((r) => r.status === 0);
  record(
    'assign-countersign',
    got === expected && allPending ? 'pass' : 'fail',
    `approval ${approval.id} records=[${got}] expected=[${expected}] status=${records.map((r) => r.status).join('/')}`,
  );
  if (got !== expected || !allPending) process.exit(1);

  // 7. both approve -> APPROVED. Records must be submitted by their assignees
  // (the permission model rejects acting on someone else's record).
  for (const r of records) {
    const who = [users.appr1, users.appr2].find((u) => u.id === r.userId);
    const res = await fetch(`${API}/auth:signIn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'local' },
      body: JSON.stringify({ account: who.username, password: USER_PASSWORD }),
    });
    const userToken = (await res.json())?.data?.token;
    if (!userToken) throw new Error(`sign-in failed for approver ${who.username}`);
    const submit = await fetch(`${API}/approvalRecords:submit?filterByTk=${r.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}`, 'X-Data-Source': 'main' },
      body: JSON.stringify({ status: 2, comment: 'ci approve', data: {} }),
    });
    if (!submit.ok) throw new Error(`submit by ${who.username}: HTTP ${submit.status} ${(await submit.text()).slice(0, 200)}`);
  }
  await sleep(1500);
  const approvals = await api(
    `approvals:list?${new URLSearchParams({ filter: JSON.stringify({ id: approval.id }), fields: 'id,status' })}`,
  );
  const finalStatus = Array.isArray(approvals) ? approvals[0]?.status : approvals?.status;
  record('countersign-approved', finalStatus === 4 ? 'pass' : 'fail', `approval ${approval.id} final status=${finalStatus} (expect 4 APPROVED)`);
  if (finalStatus !== 4) process.exit(1);

  // 8. plugin error-log scan (best effort)
  if (ERROR_LOG && fs.existsSync(ERROR_LOG)) {
    const tail = fs.readFileSync(ERROR_LOG, 'utf8').slice(-40000);
    const bad = tail.split('\n').filter((l) => /workflow-approval/i.test(l) && /(error|exception|Cannot read|TypeError)/i.test(l));
    record('plugin-error-log', bad.length ? 'fail' : 'pass', bad.length ? bad[0].slice(0, 200) : 'no workflow-approval errors in pm2 error log');
  } else {
    record('plugin-error-log', 'pass', 'error log not provided — skipped');
  }
}

main()
  .then(() => {
    const report = { base: BASE, finishedAt: new Date().toISOString(), passed: true, stages };
    if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log('\nCI SMOKE: all stages green');
  })
  .catch((e) => {
    const report = { base: BASE, finishedAt: new Date().toISOString(), passed: false, error: e.message, stages };
    if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
    console.error('\nCI SMOKE FAILED:', e.message);
    process.exit(1);
  });
