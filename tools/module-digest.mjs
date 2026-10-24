#!/usr/bin/env node
/**
 * Webpack module digest extractor — one command pulls the relevant modules out
 * of beautified NocoBase client bundles into ONE digest file, so both the
 * expensive session and subagents read a single file instead of paging through
 * megabyte bundles (cost discipline: 材料先行一次投喂).
 *
 * Expects BEAUTIFIED input (analysis/*.beautified.js). Module entries are
 * matched at line starts like `  358: function(e, t, n) {` or `  "name": …`
 * (the same heuristic used throughout the approvals project).
 *
 * Usage:
 *   # index only: what modules exist and how big
 *   node tools/module-digest.mjs --in analysis/approval-client-v2.beautified.js --index --out /tmp/idx.md
 *   # pull specific modules
 *   node tools/module-digest.mjs --in analysis/x.beautified.js --id 358 --id 1242 --out /tmp/digest.md
 *   # pull modules whose body matches a regex (case-insensitive)
 *   node tools/module-digest.mjs --in analysis/x.beautified.js --grep "FilterGroup|taskType" --out /tmp/digest.md
 * Options: --max-lines 400 (per-module cap, ellipsized)  --context 0
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const collect = (n) => {
  const out = [];
  for (let i = args.indexOf(`--${n}`); i > -1 && args[i + 1] && !args[i + 1].startsWith('--'); i = args.indexOf(`--${n}`, i + 1)) out.push(args[i + 1]);
  return out;
};
const inputs = collect('in');
const wantIds = new Set(collect('id').map(String));
const grep = arg('grep');
const grepRe = grep ? new RegExp(grep, 'i') : null;
const MAX_LINES = Number(arg('max-lines', 400));
const INDEX_ONLY = flag('index');
let OUT = arg('out');

if (!inputs.length) { console.error('no --in files'); process.exit(2); }

const ENTRY_RE = /^(\s*)(\d+|"[^"]+"):\s*(function\s*\(|\(|async)/;
const chunks = [];
for (const file of inputs) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const starts = [];
  lines.forEach((line, i) => {
    const m = ENTRY_RE.exec(line);
    if (m) starts.push({ i, id: m[2].replace(/"/g, ''), indent: m[1].length });
  });
  const modules = starts.map((s, k) => ({
    id: s.id,
    file,
    startLine: s.i + 1,
    endLine: k + 1 < starts.length ? starts[k + 1].i : lines.length,
    get text() { return lines.slice(s.i, this.endLine).join('\n'); },
  }));
  chunks.push({ file, totalLines: lines.length, modules });
  console.error(`${file}: ${modules.length} modules, ${lines.length} lines`);
}

let matched = [];
if (INDEX_ONLY) {
  matched = chunks.flatMap((c) => c.modules.map((m) => ({ ...m, size: m.endLine - m.startLine + 1, preview: '' })));
} else {
  for (const c of chunks) {
    for (const m of c.modules) {
      const size = m.endLine - m.startLine + 1;
      if (wantIds.size && !wantIds.has(m.id)) continue;
      if (grepRe) {
        // match against head of module (ids + first lines) to keep it cheap
        const head = c.totalLines ? m.text.slice(0, 20000) : '';
        if (!grepRe.test(head)) continue;
      }
      matched.push({ ...m, size });
      if (wantIds.size && matched.length >= wantIds.size && !grepRe) break;
    }
  }
}

const lines = [`# module digest — ${new Date().toISOString()}`];
for (const c of chunks) lines.push(`- source: ${c.file} (${c.totalLines} lines, ${c.modules.length} modules)`);
lines.push(`- matched: ${matched.length} module(s)${wantIds.size ? ` of requested [${[...wantIds].join(', ')}]` : ''}${grepRe ? ` grep /${grep}/i` : ''}`);
lines.push('');
if (INDEX_ONLY) {
  lines.push('| module | file | lines |', '|---|---|---|');
  for (const m of matched.sort((a, b) => b.size - a.size)) lines.push(`| ${m.id} | ${m.file.split('/').pop()} | ${m.size} |`);
} else {
  for (const m of matched) {
    const bodyLines = m.text.split('\n');
    const clipped = bodyLines.length > MAX_LINES
      ? bodyLines.slice(0, MAX_LINES).join('\n') + `\n… [+${bodyLines.length - MAX_LINES} more lines]`
      : m.text;
    lines.push(`## module ${m.id}`, `<${m.file.split('/').pop()}> lines ${m.startLine}-${m.endLine} (${m.size} lines)`, '', '```js', clipped, '```', '');
  }
}
const report = lines.join('\n');
if (OUT) {
  fs.writeFileSync(OUT, report + '\n');
  console.error(`digest → ${OUT} (${matched.length} modules, ${report.length} bytes)`);
} else {
  console.log(report);
}
