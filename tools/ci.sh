#!/usr/bin/env bash
# Deployment-verification CI for the cloned workflow-approval plugin.
#
# One run proves the release artifact deploys and works end to end:
#   build -> npm pack -> fresh NocoBase host (pinned fork, own postgres container)
#         -> tgz import + enable -> restart -> smoke E2E (submit -> countersign -> APPROVED)
#         -> teardown.
#
# Usage:
#   tools/ci.sh                     # full pipeline, ephemeral env torn down at the end
#   tools/ci.sh --keep              # keep the provisioned env + /tmp artifacts for debugging
#   tools/ci.sh --skip-build        # reuse the current dist/ (e.g. right after a manual build)
#   tools/ci.sh --fork <dir>        # host source template (default ~/approvals-reverse/source)
#
# The test env mirrors the main env's (approvals-reverse) plugin enable state,
# read live from its DB each run — override the env name with
# NOCOBASE_CI_MAIN_ENV, the source template with --fork / NOCOBASE_CI_FORK.
#
# Exit code 0 = artifact deploys and passes the E2E. Artifacts land in
# ~/approvals-ci-archive/<ts>/ (retention: newest 20 passing + all failures).
# (keep dir passed on failure regardless of --keep).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugin-workflow-approval"

KEEP=0
SKIP_BUILD=0
FORK="${NOCOBASE_CI_FORK:-$HOME/approvals-reverse/source}"
# Bootstrap credential for the EPHEMERAL CI env this run provisions (not any
# real environment) — override with NOCOBASE_CI_PASSWORD if desired.
CI_PASSWORD="${NOCOBASE_CI_PASSWORD:-ci-root-password}"
WORKSPACE="${NOCOBASE_CI_WORKSPACE:-$HOME}"
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --fork) FORK="$2"; shift ;;
    --workspace) WORKSPACE="$2"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

NB="$FORK/node_modules/.bin/nb"
PM2="$FORK/node_modules/.bin/pm2"
[ -x "$NB" ] || { echo "fork nb not found: $NB (set --fork or NOCOBASE_CI_FORK)"; exit 1; }
[ -x "$PM2" ] || { echo "fork pm2 not found: $PM2"; exit 1; }
command -v podman >/dev/null || { echo "podman is required (built-in db container)"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
ENV_NAME="ci-$STAMP"
APP_DIR="$WORKSPACE/$ENV_NAME"
# Run artifacts live in a fixed archive root (survives reboots, single known
# place; see CONTRIBUTING.md "记录与日志归档索引"), not /tmp.
ARCHIVE_ROOT="${NOCOBASE_CI_ARCHIVE:-$HOME/approvals-ci-archive}"
OUT="$ARCHIVE_ROOT/$STAMP"
mkdir -p "$OUT"
LOG="$OUT/ci.log"
exec > >(tee -a "$LOG") 2>&1

FAILED_STAGE=""
cleanup_on_fail() {
  local code=$?
  if [ "$FAILED_STAGE" != "" ] && [ ! -f "$OUT/.torn-down" ]; then
    echo
    echo "!! failed at stage: $FAILED_STAGE — artifacts kept for debugging:"
    echo "   app dir : $APP_DIR"
    echo "   logs    : $OUT/, $APP_DIR/storage/.pm2/logs/"
    echo "   teardown: tools/ci.sh --keep already; manual cleanup:"
    echo "     cd $WORKSPACE && $NB app stop -e $ENV_NAME; podman rm -f nb-$ENV_NAME-postgres; rm -rf $APP_DIR"
  fi
  exit "$code"
}
trap cleanup_on_fail EXIT

stage() { FAILED_STAGE="$1"; echo; echo "======== stage: $1 ========"; }
pass() { echo "  [ok] $1"; }
PLUGIN_VERSION="$(node -p "require('$PLUGIN_DIR/package.json').version")"
CONTAINER="nb-$ENV_NAME-postgres"

# ---------------------------------------------------------------- stage 1: build
stage "build"
if [ "$SKIP_BUILD" = "0" ]; then
  node "$PLUGIN_DIR/scripts/build.js"
fi
[ -f "$PLUGIN_DIR/dist/externalVersion.js" ] || { echo "dist/externalVersion.js missing"; exit 1; }
pass "dist complete (externalVersion.js present)"

# ---------------------------------------------------------------- stage 2: pack
stage "pack"
( cd "$PLUGIN_DIR" && npm pack --pack-destination "$OUT" >/dev/null )
TGZ="$(ls "$OUT"/nocobase-plugin-workflow-approval-*.tgz | head -1)"
[ -n "$TGZ" ] || { echo "npm pack produced no tgz"; exit 1; }
# The tgz is what ships: no file may fall outside the package.json whitelist,
# and the files that make the plugin work must all be present.
PLUGIN_PKG="$PLUGIN_DIR/package.json" node - "$TGZ" <<'EOF' || exit 1
const { execSync } = require('node:child_process');
const pkg = require(process.env.PLUGIN_PKG);
const files = execSync(`tar -tzf ${process.argv[2]}`).toString().split('\n')
  .filter((f) => f && !f.endsWith('/')).map((f) => f.replace(/^package\//, ''));
const extra = files.filter((f) => !['package.json', ...pkg.files].some((a) => f === a || f.startsWith(a.replace(/\/+$/, '') + '/')));
const critical = [
  'dist/server/index.js', 'dist/externalVersion.js',
  'dist/client/index.js',
  'dist/locale/zh-CN.json', 'server.js',
];
const missing = critical.filter((c) => !files.includes(c));
if (extra.length || missing.length) {
  console.error('tgz contents wrong — extra:', extra, 'missing:', missing);
  process.exit(1);
}
console.log(`tgz contents ok: ${files.length} files, whitelist respected, critical files present`);
EOF
pass "packed $TGZ (whitelist complete)"

# ---------------------------------------------------------------- stage 3: provision fresh host
stage "provision"
mkdir -p "$APP_DIR"
echo "hardlink-copy pinned fork source: $FORK -> $APP_DIR/source"
[ ! -e "$APP_DIR/source" ] || { echo "$APP_DIR/source already exists"; exit 1; }
cp -al "$FORK" "$APP_DIR/source"

( cd "$WORKSPACE" && "$NB" init -y -e "$ENV_NAME" \
    --setup-mode install-new --skip-download -s npm \
    --app-path "$APP_DIR" --app-client-entry-mode modern-only \
    --builtin-db --db-dialect postgres \
    --root-username nocobase --root-email admin@nocobase.com --root-password "$CI_PASSWORD" \
    -a basic --username admin@nocobase.com --password "$CI_PASSWORD" \
    --locale zh-CN --skip-skills ) || { echo "nb init failed (see above / $LOG)"; exit 1; }

read_env_field() { node -e "const c=require(process.env.HOME+'/.nocobase/config.json');const e=c.envs['$1']||{};process.stdout.write(String(e['$2']??''))"; }
APP_PORT="$(read_env_field "$ENV_NAME" appPort)"
[ -n "$APP_PORT" ] || { echo "nb did not register appPort for $ENV_NAME"; exit 1; }
BASE="http://127.0.0.1:$APP_PORT"
API="$BASE/api"

echo "waiting for app health at $BASE (up to 300s)"
for i in $(seq 1 60); do
  if curl -sf -m 5 "$BASE/__health_check" >/dev/null 2>&1; then break; fi
  [ "$i" = "60" ] && { echo "app never became healthy"; exit 1; }
  sleep 5
done
pass "provisioned env=$ENV_NAME port=$APP_PORT (hardlink fork copy + own pg container)"

# ---------------------------------------------------------------- stage 4: install plugin
stage "install-plugin"
( cd "$WORKSPACE" && "$NB" plugin import "$TGZ" -e "$ENV_NAME" -y ) || { echo "plugin import failed"; exit 1; }
[ -f "$APP_DIR/storage/plugins/@nocobase/plugin-workflow-approval/dist/externalVersion.js" ] \
  || { echo "imported plugin incomplete in storage/plugins"; exit 1; }

DB_PORT="$(podman port "$CONTAINER" 5432/tcp | awk '{print $NF}' | sed 's/.*://')"
[ -n "$DB_PORT" ] || { echo "cannot resolve db container port"; exit 1; }

# nb plugin enable does not persist for storage/plugins installs (docs/08 §10.2) —
# the working flow is a direct applicationPlugins row with installed=false, so the
# app runs the plugin install (collection sync + migrations) on next boot.
podman exec "$CONTAINER" psql -U nocobase -d nocobase -v ON_ERROR_STOP=1 -c \
  "INSERT INTO \"applicationPlugins\" (\"createdAt\",\"updatedAt\",\"name\",\"packageName\",\"version\",\"enabled\",\"installed\",\"builtIn\") \
   VALUES (now(),now(),'workflow-approval','@nocobase/plugin-workflow-approval','$PLUGIN_VERSION',true,false,false)"

# Mirror the main environment's plugin enable state (CONTRIBUTING.md archival
# contract: the test env runs the same plugin surface the operator runs). Read
# live from the main env DB every run — plugins enabled there later are picked
# up automatically. workflow-approval is excluded (installed by this stage).
MAIN_CONTAINER="nb-${NOCOBASE_CI_MAIN_ENV:-approvals-reverse}-postgres"
MAIN_STATE="$(podman exec "$MAIN_CONTAINER" psql -U nocobase -d nocobase -At -F$'\t' \
  -c "SELECT name, enabled FROM \"applicationPlugins\" WHERE name <> 'workflow-approval' ORDER BY name" 2>/dev/null)" \
  || { echo "cannot read main env DB ($MAIN_CONTAINER) — set NOCOBASE_CI_MAIN_ENV if the main env is named differently"; exit 1; }
[ -n "$MAIN_STATE" ] || { echo "main env plugin list empty — is $MAIN_CONTAINER the right DB?"; exit 1; }
CI_NAMES="$(podman exec "$CONTAINER" psql -U nocobase -d nocobase -At -c 'SELECT name FROM "applicationPlugins"')"
VALUES=""
NOT_MIRRORED=""
while IFS=$'\t' read -r name en; do
  [ -n "$name" ] || continue
  # psql -At prints booleans as t/f; bare "t" is not a valid SQL literal.
  case "$en" in t|true) en=true ;; f|false) en=false ;; *) echo "  skip $name: odd enabled value '$en'"; continue ;; esac
  case "$name" in *[!a-z0-9-]*) echo "  skip non-standard plugin name: $name"; continue ;; esac
  if ! grep -qxF "$name" <<< "$CI_NAMES"; then
    NOT_MIRRORED="$NOT_MIRRORED $name"
    continue
  fi
  VALUES="${VALUES:+$VALUES,}('$name',$en)"
done <<< "$MAIN_STATE"
if [ -n "$VALUES" ]; then
  CHANGED=$(podman exec "$CONTAINER" psql -U nocobase -d nocobase -At -c \
    "WITH v(name, enabled) AS (VALUES $VALUES) \
     UPDATE \"applicationPlugins\" AS ci SET \"enabled\" = v.enabled FROM v \
     WHERE ci.name = v.name AND ci.\"enabled\" IS DISTINCT FROM v.enabled RETURNING 1" | wc -l)
  echo "  plugin enable-state mirrored from ${NOCOBASE_CI_MAIN_ENV:-approvals-reverse}: $CHANGED row(s) changed"
fi
[ -n "$NOT_MIRRORED" ] && echo "  note: on main env but absent here (not mirrored):$NOT_MIRRORED"
WF_ON=$(podman exec "$CONTAINER" psql -U nocobase -d nocobase -At -c "SELECT enabled FROM \"applicationPlugins\" WHERE name='workflow'")
[ "$WF_ON" = "t" ] || { echo "workflow engine not enabled after mirroring — smoke would be meaningless"; exit 1; }

# Built-in compatibility gate (operator contract, 2026-10-23): every built-in
# plugin is force-enabled in the test env even when the main env keeps it off —
# the clone must load cleanly next to the FULL builtin surface. Builtin rows not
# installed yet keep installed=false, so boot runs their install (collection
# sync + migrations) exactly like the workflow-approval row above.
BUILTIN_OFF="$(podman exec "$CONTAINER" psql -U nocobase -d nocobase -At -c \
  "SELECT name FROM \"applicationPlugins\" WHERE \"builtIn\" = true AND \"enabled\" IS NOT true ORDER BY name")"
if [ -n "$BUILTIN_OFF" ]; then
  echo "  builtin compat: force-enabling built-in plugins:"
  echo "$BUILTIN_OFF" | sed 's/^/    + /'
  podman exec "$CONTAINER" psql -U nocobase -d nocobase -v ON_ERROR_STOP=1 -c \
    "UPDATE \"applicationPlugins\" SET \"enabled\" = true WHERE \"builtIn\" = true AND \"enabled\" IS NOT true" >/dev/null
else
  echo "  builtin compat: all built-in plugins already enabled"
fi

# Hot-restart trap (docs/08 §10.3): nb app restart does not always spawn a new
# process. Note the restart moment and assert the PM2 process is younger; if not,
# kill -9 and start over.
RESTART_AT="$(date +%s)"
( cd "$WORKSPACE" && "$NB" app restart -e "$ENV_NAME" ) || { echo "app restart failed"; exit 1; }
sleep 3
assert_fresh_process() {
  local pid uptime_ms
  pid="$(PM2_HOME="$APP_DIR/storage/.pm2" "$PM2" pid index 2>/dev/null | tail -1)"
  [ -n "$pid" ] && [ "$pid" != "0" ] || { echo "pm2 has no 'index' process"; return 1; }
  uptime_ms="$(ps -o etimes= -p "$pid" | tr -d ' ')"
  [ "$uptime_ms" -lt "$(( $(date +%s) - RESTART_AT + 5 ))" ] \
    || { echo "process $pid is stale (up ${uptime_ms}s, restarted at $RESTART_AT)"; return 1; }
  echo "  fresh process pid=$pid (up ${uptime_ms}s)"
}
if ! assert_fresh_process; then
  echo "hot restart did not replace the process — kill -9 and start again"
  kill -9 "$(PM2_HOME="$APP_DIR/storage/.pm2" "$PM2" pid index | tail -1)" 2>/dev/null || true
  ( cd "$WORKSPACE" && "$NB" app start -e "$ENV_NAME" ) || { echo "app start failed"; exit 1; }
  RESTART_AT="$(date +%s)"
  sleep 3
  assert_fresh_process || { echo "process still stale after forced restart"; exit 1; }
fi

echo "waiting for app health again (up to 300s)"
for i in $(seq 1 60); do
  if curl -sf -m 5 "$BASE/__health_check" >/dev/null 2>&1; then break; fi
  [ "$i" = "60" ] && { echo "app never became healthy after plugin install"; exit 1; }
  sleep 5
done
pass "plugin v$PLUGIN_VERSION installed + app restarted (fresh process verified)"

# Enable must survive the restart: a builtin that fails to install or errors at
# boot would surface here (still disabled, or the health wait above already
# failed) — either way the compat gate stops the run before smoke.
BUILTIN_STILL_OFF="$(podman exec "$CONTAINER" psql -U nocobase -d nocobase -At -c \
  "SELECT name FROM \"applicationPlugins\" WHERE \"builtIn\" = true AND \"enabled\" IS NOT true ORDER BY name")"
[ -z "$BUILTIN_STILL_OFF" ] || { echo "built-in plugins still disabled after restart: $BUILTIN_STILL_OFF"; exit 1; }
pass "builtin compat: no built-in plugin left disabled"

# ---------------------------------------------------------------- stage 5: smoke E2E
stage "smoke"
node "$REPO_ROOT/tools/ci-smoke.mjs" \
  --base "$BASE" \
  --container "$CONTAINER" \
  --error-log "$APP_DIR/storage/.pm2/logs/index-error.log" \
  --report "$OUT/report.json"
pass "smoke E2E: submit -> countersign -> APPROVED"

# ---------------------------------------------------------------- teardown
stage "teardown"
if [ "$KEEP" = "1" ]; then
  echo "--keep set: env $ENV_NAME left running at $BASE (admin@nocobase.com / $CI_PASSWORD)"
  touch "$OUT/.torn-down"
else
  # Order matters: stop the app AND its per-app PM2 daemon first (a live daemon
  # recreates storage/.pm2 after the rm), then the container, then the dir
  # (pgdata is container-uid owned — podman unshare sees it), then the registry.
  ( cd "$WORKSPACE" && "$NB" app stop -e "$ENV_NAME" ) || true
  PM2_HOME="$APP_DIR/storage/.pm2" "$PM2" kill >/dev/null 2>&1 || true
  podman rm -f "$CONTAINER" >/dev/null 2>&1 || true
  podman unshare rm -rf "$APP_DIR" >/dev/null 2>&1 || rm -rf "$APP_DIR" || true
  ( cd "$WORKSPACE" && "$NB" env remove "$ENV_NAME" -f >/dev/null 2>&1 ) || true
  touch "$OUT/.torn-down"
  pass "torn down (report kept: $OUT/report.json)"
fi

# Retention: keep the newest 20 passing runs plus every failed/incomplete run.
# Anything without a passing report.json is never pruned.
if [ "$KEEP" = "0" ]; then
  ls -1dt "$ARCHIVE_ROOT"/*/ 2>/dev/null | tail -n +21 | while read -r d; do
    if [ -f "$d/report.json" ] \
       && node -e "process.exit(JSON.parse(require('node:fs').readFileSync(process.argv[1],'utf8')).passed ? 0 : 1)" "$d/report.json" 2>/dev/null; then
      rm -rf "$d"
    fi
  done
fi

FAILED_STAGE=""
echo
echo "======================================================="
echo "CI PASS — v$PLUGIN_VERSION deploys and works end to end"
echo "report: $OUT/report.json   log: $LOG"
echo "======================================================="
