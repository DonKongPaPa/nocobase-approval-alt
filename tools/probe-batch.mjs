#!/usr/bin/env node
/**
 * Batched API probe runner — merges N fixed-step probes into ONE run and ONE
 * report file (cost discipline: the expensive session reads one result, it
 * does not fire probes one by one; see CONTRIBUTING.md archival/cost rules).
 *
 * Signs in once, reuses the token, runs every probe from a manifest, writes a
 * single JSON report, exits 0 only if every probe meets its expectation.
 *
 * Manifest (JSON):
 * {
 *   "probes": [
 *     {"name":"app-info", "method":"GET", "path":"app:getInfo"},
 *     {"name":"users",    "method":"GET", "path":"users:list?pageSize=1", "expectStatus":200},
 *     {"name":"create",   "method":"POST","path":"t_x:create", "body":{"title":"probe"}},
 *     {"name":"anon",     "path":"app:getInfo", "noAuth":true}
 *   ]
 * }
 *
 * Usage:
 *   node tools/probe-batch.mjs --base http://127.0.0.1:13800 \
 *        --manifest tools/probes.example.json --out /tmp/probes-report.json
 * Options: --account --password --authenticator(local|basic) --space <X-Spaces>
 *          --max-body <chars per captured body, default 2000>
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
const BASE = (arg('base') || 'http://127.0.0.1:13800').replace(/\/$/, '');
const API = `${BASE}/api`;
const MANIFEST = arg('manifest');
const OUT = arg('out');
const ACCOUNT = arg('account', 'admin@nocobase.com');
const PASSWORD = arg('password', process.env.NOCOBASE_ADMIN_PASSWORD ?? '');
const AUTHENTICATOR = arg('authenticator', 'local');
const SPACE = arg('space');
const MAX_BODY = Number(arg('max-body', 2000));

if (!MANIFEST || !fs.existsSync(MANIFEST)) {
  console.error(`manifest not found: ${MANIFEST}`);
  process.exit(2);
}
const { probes } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
if (!Array.isArray(probes) || !probes.length) {
  console.error('manifest has no probes');
  process.exit(2);
}

async function call(path, { method = 'GET', body, headers = {}, noAuth = false } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Data-Source': 'main',
      ...(noAuth ? {} : { Authorization: `Bearer ${global.__token}` }),
      ...(global.__token && !noAuth ? {} : {}),
      ...(SPACE ? { 'X-Spaces': SPACE } : {}),
      ...(!noAuth ? { 'X-Authenticator': AUTHENTICATOR } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    ms: Date.now() - t0,
    body: text.length > MAX_BODY ? text.slice(0, MAX_BODY) + `…[+${text.length - MAX_BODY} chars]` : text,
  };
}

let token = null;
if (!process.argv.includes('--no-login')) {
  const res = await fetch(`${API}/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': AUTHENTICATOR },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  token = json?.data?.token;
  if (!token) {
    console.error(`sign-in failed: HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    process.exit(1);
  }
}
global.__token = token;

const results = [];
for (const p of probes) {
  const { name = `${p.method || 'GET'} ${p.path}`, method = 'GET', path, body, headers, noAuth, expectStatus } = p;
  if (!path) {
    results.push({ name, ok: false, error: 'probe missing "path"' });
    continue;
  }
  try {
    const r = await call(path, { method, body, headers, noAuth });
    const ok = expectStatus ? r.status === expectStatus : r.status < 400;
    results.push({ name, method, path, ok, ...r, expectStatus: expectStatus ?? null });
  } catch (e) {
    results.push({ name, method, path, ok: false, error: e.message });
  }
}

const failed = results.filter((r) => !r.ok);
const report = {
  base: BASE,
  manifest: MANIFEST,
  finishedAt: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  passAll: failed.length === 0,
  results,
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

for (const r of results) {
  console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name} → ${r.status ?? 'ERR'} (${r.ms ?? '-'}ms)${r.error ? ' ' + r.error : ''}`);
}
console.log(`\nprobe-batch: ${report.passed}/${report.total} passed${OUT ? ` → report ${OUT}` : ''}`);
process.exit(failed.length ? 1 : 0);
