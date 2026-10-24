// CDP screencast recorder: node record-cdp.mjs <cdpPort> <prefix> [maxSeconds]
// Frames -> /tmp/cdp-rec-<prefix>/frames/*.jpg ; touch /tmp/cdp-rec-<prefix>.stop to stop; then ffmpeg -> mp4
import fs from 'node:fs';
import { execSync } from 'node:child_process';
// Resolve the ws module from your NocoBase host tree (repo root has no
// node_modules): set WS_MODULE_PATH, e.g. ~/nocobase/source/node_modules/ws/index.js
const { default: WebSocket } = await import(process.env.WS_MODULE_PATH ?? 'ws');

const port = process.argv[2];
const prefix = process.argv[3];
const maxSec = Number(process.argv[4] || 180);
const dir = `/tmp/cdp-rec-${prefix}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(`${dir}/frames`, { recursive: true });
fs.rmSync(`/tmp/cdp-rec-${prefix}.stop`, { force: true });

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('no page target');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
let n = 0;
const t0 = Date.now();
const stopFlag = () => fs.existsSync(`/tmp/cdp-rec-${prefix}.stop`);
ws.on('message', (buf) => {
  const msg = JSON.parse(buf.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? msg.error);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Page.screencastFrame') {
    const f = ++n;
    try {
      fs.writeFileSync(`${dir}/frames/f${String(f).padStart(5, '0')}.jpg`, Buffer.from(msg.params.data, 'base64'));
      ws.send(JSON.stringify({ id: 100000 + f, method: 'Page.screencastFrameAck', params: { sessionId: msg.params.sessionId } }));
    } catch (e) {
      console.error('frame write error', e.message);
    }
    if (f % 20 === 0) console.error(`frame ${f} t=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
});
await new Promise((r) => ws.on('open', r));
await send('Page.enable');
await send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
console.error(`recording ${prefix} (target url: ${page.url})`);
while (!stopFlag() && (Date.now() - t0) / 1000 < maxSec) await new Promise((r) => setTimeout(r, 100));
await send('Page.stopScreencast').catch(() => {});
ws.close();
console.error(`capture done frames=${n}, assembling mp4...`);
execSync(
  `ffmpeg -y -loglevel error -framerate 6 -i ${dir}/frames/f%05d.jpg -vf "fps=6,scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -movflags +faststart ${dir}/${prefix}.mp4`,
  { stdio: 'inherit' },
);
console.error(`mp4: ${dir}/${prefix}.mp4 frames=${n} duration=$((n/6))s`);
