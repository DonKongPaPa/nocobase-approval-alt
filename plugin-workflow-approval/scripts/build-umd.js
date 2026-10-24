#!/usr/bin/env node
/**
 * Build a plugin client lane as a UMD bundle compatible with NocoBase's
 * RequireJS-based client loader, mirroring the wrapper the official build emits:
 *   module.exports = factory(require(deps...))
 *   define("pkg/lane", [deps...], factory)
 * Usage: node build-umd.js <entry.jsx> <outfile.js> <amd-name> <dep...>
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const [entry, outfile, amdName, ...deps] = process.argv.slice(2);
if (!entry || !outfile || !amdName) {
  console.error('usage: build-umd.js <entry> <outfile> <amdName> <deps...>');
  process.exit(1);
}

const tmp = path.join('/tmp', path.basename(outfile) + '.cjs.js');
execSync(
  `npx -y esbuild@0.25.5 ${entry} --bundle --format=cjs --outfile=${tmp} ` +
    `--external:@nocobase/* --external:react --external:react-dom --external:react-router-dom ` +
    `--external:react-i18next --external:antd --external:antd-style --external:@ant-design/* ` +
    `--external:@dnd-kit/* ` +
    `--external:@formily/* --external:@emotion/css --external:lodash --external:dayjs --external:ahooks ` +
    `--loader:.jsx=jsx --jsx=transform --minify`,
  { stdio: 'inherit' },
);

let body = fs.readFileSync(tmp, 'utf8');

// collect the distinct externals actually required
const used = new Set();
body = body.replace(/require\((["'])([^"']+)\1\)/g, (m, q, dep) => {
  used.add(dep);
  return `__DEP(${JSON.stringify(dep)})`;
});

const depList = deps.filter((d) => used.has(d));
const extra = Array.from(used).filter((d) => !depList.includes(d));
if (extra.length) {
  console.error('ERROR: unexpected unlisted deps:', extra);
  process.exit(1);
}

// params per dep (sanitized)
const paramName = (dep) => '__dep_' + dep.replace(/[^a-zA-Z0-9]/g, '_');
body = body.replace(/__DEP\((["'][^"']+["'])\)/g, (m, q) => paramName(JSON.parse(q)));

const argList = depList.map((d) => `require(${JSON.stringify(d)})`).join(',');
const amdIds = depList.map((d) => JSON.stringify(d)).join(',');
const paramList = depList.map((d) => paramName(d)).join(',');

const wrapped = `!function(e,t){
if("object"==typeof exports&&"object"==typeof module){module.exports=t(module,exports,${argList})}
else if("function"==typeof define&&define.amd){define(${JSON.stringify(amdName)},[${amdIds}],function(${paramList}){var m={exports:{}};var r=t(m,m.exports,${paramList});return m.exports})}
else{var m={exports:{}};t(m,m.exports,${paramList});e[${JSON.stringify(amdName)}]=m.exports}
}(this,function(module,exports,${paramList}){
${body}
return module.exports;
});`;

fs.writeFileSync(outfile, wrapped);
console.log(`wrote ${outfile} (${wrapped.length} bytes, ${depList.length} deps)`);
