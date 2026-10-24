#!/usr/bin/env node
/**
 * Full build orchestrator: src/ → dist/.
 *   node scripts/build.js            everything (default)
 *   node scripts/build.js client     client lane only
 *   node scripts/build.js client-v2  client-v2 lane only
 *   node scripts/build.js server     server + locale verbatim copy only
 *
 * Client lanes are UMD bundles wrapped for NocoBase's RequireJS loader
 * (scripts/build-umd.js). Server and locale are plain CJS/JSON authored
 * directly under src/ and copied verbatim — no transpilation.
 *
 * client-v2 lane 定位：v3 settings 壳（/settings/workflow flow-engine 设计器）
 * 的 workflow 配置面适配层（触发器/审批节点字段集 + 画布 + 页面模型配置子集）。
 * 审批中心/任务卡/表单 UI 不在该 lane，由 v3 portal 扩展承载。
 */
const { execFileSync } = require('child_process');
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = process.argv.slice(2);
const all = targets.length === 0 || targets.includes('all');

const CLIENT_V2_DEPS = [
  '@nocobase/plugin-workflow/client-v2',
  '@nocobase/client-v2',
  '@nocobase/flow-engine',
  '@nocobase/utils/client',
  '@nocobase/plugin-notification-manager/client-v2',
  'react',
  'antd',
  'ahooks',
  '@ant-design/icons',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@emotion/css',
  'dayjs',
  'react-i18next',
  'react-router-dom',
];

const CLIENT_DEPS = [
  '@nocobase/plugin-workflow/client',
  '@nocobase/client',
  'react',
  'react-router-dom',
  'antd',
  'ahooks',
];

function buildLane(entry, outfile, amdName, deps) {
  fs.mkdirSync(path.dirname(path.join(root, outfile)), { recursive: true });
  execFileSync(
    'node',
    [path.join(__dirname, 'build-umd.js'), entry, outfile, amdName, ...deps],
    { cwd: root, stdio: 'inherit' },
  );
}

function copyVerbatim(from, to) {
  fs.rmSync(path.join(root, to), { recursive: true, force: true });
  fs.cpSync(path.join(root, from), path.join(root, to), { recursive: true });
}

// The host pm compatibility check (plugin-manager/utils.js getCompatible) needs a
// version snapshot per external package: plugins WITH src/ get scanned, ours are
// deployed without src/ so the host requires `dist/externalVersion.js`
// ({packageRoot: version}); a missing file fails the check with an empty table.
// Versions resolve from one base tree, selected by NOCOBASE_EXTERNAL_HOST:
//   unset            → this repo's node_modules (symlinked to the 2.4 main env tree)
//   <path to node_modules> → that host tree (e.g. a 3.0 host: its @nocobase/*
//     packages are versioned 3.0.x, and the snapshot must match the target host —
//     one snapshot cannot satisfy two host lines, so build per target).
// Resolution falls back to the official externalVersion snapshots of the same tree
// (client-side packages are served as UMD by the host, not present in its npm tree).
function collectExternalPackages() {
  const packages = new Set();
  const builtins = new Set(require('module').builtinModules);
  const patterns = [/\brequire\(\s*["']([^"']+)["']\s*\)/g, /\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(entry.name)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const re of patterns) {
          for (const m of text.matchAll(re)) {
            const spec = m[1];
            if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
            const pkgRoot = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
            if (!builtins.has(pkgRoot)) packages.add(pkgRoot);
          }
        }
      }
    }
  };
  walk(path.join(root, 'src'));
  return [...packages].sort();
}

function resolveExternalVersions() {
  const hostTree = process.env.NOCOBASE_EXTERNAL_HOST;
  const base = hostTree ? path.join(hostTree, 'package.json') : path.join(root, 'package.json');
  if (hostTree) console.log(`externalVersion base: ${hostTree}`);
  const pluginRequire = createRequire(base);
  const snapshots = {};
  for (const provider of ['@nocobase/plugin-workflow', '@nocobase/plugin-notification-manager']) {
    try { Object.assign(snapshots, pluginRequire(`${provider}/dist/externalVersion.js`)); } catch (e) { /* optional fallback */ }
  }
  const versions = {};
  for (const pkg of collectExternalPackages()) {
    let version;
    try { version = pluginRequire(`${pkg}/package.json`).version; } catch (e) { /* fall through */ }
    if (typeof version !== 'string') version = snapshots[pkg];
    if (typeof version !== 'string') throw new Error(`cannot resolve version for external package "${pkg}" (not in local tree nor official snapshot)`);
    versions[pkg] = version;
  }
  return versions;
}

function writeExternalVersion() {
  const versions = resolveExternalVersions();
  const body = `// Generated by scripts/build.js — host pm compatibility-check snapshot\n// (semver.satisfies these versions against the host deps table). Do not edit.\nmodule.exports = ${JSON.stringify(versions, null, 2)};\n`;
  fs.writeFileSync(path.join(root, 'dist/externalVersion.js'), body);
  console.log(`wrote dist/externalVersion.js (${Object.keys(versions).length} packages)`);
}

function check(expectFiles, requireEntry) {
  for (const f of expectFiles) {
    if (!fs.existsSync(path.join(root, f))) {
      console.error(`BUILD CHECK FAILED: missing ${f}`);
      process.exit(1);
    }
  }
  if (requireEntry) require(path.join(root, requireEntry));
}

if (all || targets.includes('client-v2')) {
  buildLane('src/client-v2/index.jsx', 'dist/client-v2/index.js', '@nocobase/plugin-workflow-approval/client-v2', CLIENT_V2_DEPS);
}
if (all || targets.includes('client')) {
  buildLane('src/client/index.jsx', 'dist/client/index.js', '@nocobase/plugin-workflow-approval/client', CLIENT_DEPS);
}
if (all || targets.includes('server')) {
  copyVerbatim('src/server', 'dist/server');
  copyVerbatim('src/locale', 'dist/locale');
}
if (all || targets.includes('server') || targets.includes('external-version')) {
  writeExternalVersion();
}

if (all) {
  check([
    'dist/client/index.js',
    'dist/client-v2/index.js',
    'dist/server/index.js',
    'dist/server/trigger.js',
    'dist/server/instruction.js',
    'dist/server/service.js',
    'dist/server/actions.js',
    'dist/server/notifications.js',
    'dist/server/constants.js',
    'dist/server/collections/approvals.js',
    'dist/server/collections/approvalRecords.js',
    'dist/server/collections/approvalAudiences.js',
    'dist/server/collections/approvalAudienceUsers.js',
    'dist/server/collections/approvalExecutions.js',
    'dist/server/collections/approvalMsgTpls.js',
    'dist/locale/zh-CN.json',
    'dist/locale/en-US.json',
  ], 'dist/server/index.js');
  console.log('build ok: 4 lanes present, server entry loads');
}
