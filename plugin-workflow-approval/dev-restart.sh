#!/bin/bash
# full build (scripts/build.js: 1 UMD client lane + server/locale verbatim),
# restart the app, re-sync plugin statics into the served snapshot
NB_MAIN_HOME="${NB_MAIN_HOME:-$HOME/approvals-reverse}"
set -e
cd "$(dirname "$0")"
# 批7 护栏：本脚本目标是 2.4 环境（13800）。feat/v3-ai-portal 分支的 client-v2 lane
# 按 v3 宿主 API 轻量化重写，构建产物刷进 13800 会使其设置壳审批 lane 404
# （画布「暂不支持的节点」，2026-10-22 事故）。13800 部署源 = main 分支构建的
# artifacts/*.tgz（含 2.4 全量 lane）：解包到 source/node_modules 与
# storage/dist-client/<ver>/static/plugins 两处（tar 保 mtime，?hash= 按 mtime 参与
# 计算），静态快照必须在 app start 之后再铺（启动会剪目录）。
BRANCH=$(git -C .. branch --show-current)
if [ "$BRANCH" != "main" ] && [ "$FORCE_13800" != "1" ]; then
  echo "REFUSED: dev-restart targets the 2.4 env (13800) but current branch is '$BRANCH'." >&2
  echo "Non-main branches carry the v3-flavored client-v2 lane which breaks 13800." >&2
  echo "Set FORCE_13800=1 to override (you probably want the v3 env deploy instead)." >&2
  exit 1
fi
npm run --silent build
# server copy (loaded by node from app node_modules)
SRV=${NB_MAIN_HOME:-$HOME/approvals-reverse}/source/node_modules/@nocobase/plugin-workflow-approval
rm -rf "$SRV"
mkdir -p "$SRV"
cp -r dist client.js server.js package.json "$SRV"/ 2>/dev/null || {
  mkdir -p "$SRV/node_modules/@nocobase"
  ln -sfn ${NB_MAIN_HOME:-$HOME/approvals-reverse}/source/node_modules/@nocobase "$SRV/node_modules/@nocobase"
  cp -r dist client.js server.js package.json "$SRV"/
}
RESTART_AT=$(date +%s)
nb app restart > /dev/null 2>&1 &
for i in $(seq 1 30); do curl -sf -m 4 -o /dev/null http://127.0.0.1:13800/__health_check && break; sleep 4; done
# pm2 restart may keep the OLD process alive (docs/08 pitfall #1, hit again 2026-10-21):
# assert the process is younger than this restart; otherwise force a fresh start.
PID=$(PM2_HOME=${NB_MAIN_HOME:-$HOME/approvals-reverse}/storage/.pm2 ./source/node_modules/.bin/pm2 pid index 2>/dev/null)
ET=$(ps -o etimes= -p "$PID" 2>/dev/null | tr -d ' ')
if [ -z "$ET" ] || [ "$ET" -ge $(( $(date +%s) - RESTART_AT + 10 )) ]; then
  echo "stale process after restart (pid=$PID etimes=$ET) — forcing fresh start"
  PM2_HOME=${NB_MAIN_HOME:-$HOME/approvals-reverse}/storage/.pm2 ./source/node_modules/.bin/pm2 delete index >/dev/null 2>&1
  nb app start -e approvals-reverse -y > /dev/null 2>&1
  for i in $(seq 1 45); do curl -sf -m 4 -o /dev/null http://127.0.0.1:13800/__health_check && break; sleep 4; done
fi
# client static copy (served under /dist/<version>/static/plugins)
SNAP=${NB_MAIN_HOME:-$HOME/approvals-reverse}/storage/dist-client/2.4.0-alpha.9/static/plugins/@nocobase/plugin-workflow-approval
rm -rf "$SNAP"
mkdir -p "$SNAP"
cp -r dist "$SNAP"/
sleep 1
echo "served: $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:13800/dist/2.4.0-alpha.9/static/plugins/@nocobase/plugin-workflow-approval/dist/client/index.js)"
