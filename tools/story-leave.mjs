#!/usr/bin/env node
/**
 * Leave-story seeder for the v3 dev environment (approval-v3-dev @13810).
 *
 * Story: 青禾科技请假审批一条龙 —— 建表 → 两级审批流（组长审批 → 人事备案）
 *        → 五操作（通过/拒绝/退回/转签/加签）→ in-app 收信箱通知贯穿。
 * Docs: docs/15-leave-story-e2e.md
 *
 * Idempotent: every fixture is looked up by its stable name/title first and only
 * created when missing. Safe to re-run.
 *
 * Fixtures:
 *   - collection leave_requests { leaveType select / startDate / endDate / days / reason }
 *   - users zhangsan(张三 申请人) / lisi(李四 一级审批) / wangwu(王五 二级审批·加签对象)
 *           zhaoliu(赵六 转签对象)              — password: NOCOBASE_USER_PASSWORD
 *   - in-app channel leave-story (todo/done 中文 custom 模板)
 *   - workflow 请假审批流: L1 组长审批(negotiation 会签, actions 2/-1/1,
 *     toDelegateReassignees=[赵六], toAddReassignees=[王五,赵六], todo 通知)
 *     → L2 人事备案(actions 2/1, todo 通知); trigger withdrawable + done 通知
 *   - smoke: API 发起一单 → 断言李四拿到 PENDING 任务 → 销毁清理
 */
const DEFAULT_BASE = 'http://127.0.0.1:13810';
const ACCOUNT = 'admin@nocobase.com';
const PASSWORD = process.env.NOCOBASE_ADMIN_PASSWORD ?? '';
const USER_PASSWORD = process.env.NOCOBASE_USER_PASSWORD ?? '';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = (baseIdx > -1 ? args[baseIdx + 1] : DEFAULT_BASE).replace(/\/$/, '');
const API = `${BASE}/api`;

let token = null;

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Authenticator': 'basic',
      'X-Role': 'root',
      'X-Data-Source': 'main',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 204) return null; // destroy 等成功空响应
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: non-JSON response (${res.status}): ${text.slice(0, 160)}`);
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

  const state = { base: BASE, seededAt: new Date().toISOString(), fixtures: {} };

  // 1. collection leave_requests
  let leave = await findFirst('collections:list', { name: 'leave_requests' });
  if (!leave) {
    leave = await api('collections:create', {
      method: 'POST',
      body: {
        name: 'leave_requests',
        title: '请假申请',
        fields: [
          { type: 'string', name: 'leaveType', interface: 'select', uiSchema: { type: 'string', title: '请假类型', enum: [
            { label: '年假', value: 'annual' }, { label: '事假', value: 'personal' },
            { label: '病假', value: 'sick' }, { label: '调休', value: 'comp' },
          ] } },
          { type: 'date', name: 'startDate', interface: 'datetime', uiSchema: { type: 'string', title: '开始日期' } },
          { type: 'date', name: 'endDate', interface: 'datetime', uiSchema: { type: 'string', title: '结束日期' } },
          { type: 'integer', name: 'days', interface: 'integer', uiSchema: { type: 'number', title: '天数' } },
          { type: 'text', name: 'reason', interface: 'textarea', uiSchema: { type: 'string', title: '请假事由' } },
        ],
      },
    });
    log('collection leave_requests created');
  } else {
    log('collection leave_requests exists');
  }
  // column writable probe
  const probe = await api('leave_requests:create', {
    method: 'POST',
    body: { leaveType: 'annual', days: 1, reason: 'seeder-probe' },
  });
  await api(`leave_requests:destroy?filterByTk=${probe.id}`, { method: 'POST' });
  log('leave_requests columns writable (probe row created+destroyed)');

  // 2. users
  const users = {};
  for (const [key, username, nickname] of [
    ['applicant', 'zhangsan', '张三'],
    ['appr1', 'lisi', '李四'],
    ['appr2', 'wangwu', '王五'],
    ['delegate', 'zhaoliu', '赵六'],
  ]) {
    let user = await findFirst('users:list', { username });
    if (!user) {
      user = await api('users:create', { method: 'POST', body: { username, nickname, password: USER_PASSWORD } });
      log(`user ${username} created (id ${user.id})`);
    } else {
      log(`user ${username} exists (id ${user.id})`);
    }
    users[key] = user;
    state.fixtures[key] = { id: user.id, username };
  }

  // 3. in-app channel + story templates
  let channel = await findFirst('notificationChannels:list', { name: 'leave-story' });
  if (!channel) {
    channel = await api('notificationChannels:create', {
      method: 'POST',
      body: { name: 'leave-story', title: '请假故事通知', notificationType: 'in-app-message', meta: { editable: true, deletable: true } },
    });
    log('channel leave-story created');
  } else {
    log('channel leave-story exists');
  }
  // vars verified against server/notifications.js data payload
  const TODO_NOTE = [{
    channel: 'leave-story', templateType: 'custom',
    template: { title: '有新的审批任务：{{approval.nodeTitle}}', content: '申请人：{{applicant.nickname}}\n单据：{{approval.dataKey}}' },
  }];
  const DONE_NOTE = [{
    channel: 'leave-story', templateType: 'custom',
    template: { title: '审批有新进展：{{approval.workflowTitle}}', content: '单据 #{{approval.approvalId}}，当前状态：{{statusText}}' },
  }];

  // 4. workflow 请假审批流: L1 组长审批 → L2 人事备案
  let wf = await findFirst('workflows:list', { title: '请假审批流', type: 'approval' });
  if (!wf) {
    wf = await api('workflows:create', {
      method: 'POST',
      body: {
        title: '请假审批流', type: 'approval',
        config: { mode: 0, collection: 'leave_requests', centralized: true, withdrawable: true, notifications: DONE_NOTE },
      },
    });
    const n1 = await api('flow_nodes:create', {
      method: 'POST',
      body: {
        workflowId: wf.id, type: 'approval', title: '组长审批',
        config: {
          assignees: [users.appr1.id], negotiation: 1, order: false, branchMode: false,
          // actions 枚举即按钮集（docs/04 §7.4 syncProcessActionToNodeConfig）：
          // 8=Delegate 99=Add assignee——缺了就没有转签/加签按钮
          actions: [2, -1, 1, 8, 99],
          toDelegateReassignees: [users.delegate.id],
          toAddReassignees: [users.appr2.id, users.delegate.id],
          notifications: TODO_NOTE,
        },
      },
    });
    const n2 = await api('flow_nodes:create', {
      method: 'POST',
      body: {
        workflowId: wf.id, type: 'approval', title: '人事备案',
        config: { assignees: [users.appr2.id], negotiation: 1, order: false, branchMode: false, actions: [2, 1], notifications: TODO_NOTE },
      },
    });
    await api(`flow_nodes:update?filterByTk=${n1.id}`, { method: 'POST', body: { downstreamId: n2.id } });
    await api(`flow_nodes:update?filterByTk=${n2.id}`, { method: 'POST', body: { upstreamId: n1.id } });
    log(`workflow 请假审批流 created (id ${wf.id}, chain ${n1.id} -> ${n2.id})`);
  } else {
    log(`workflow 请假审批流 exists (id ${wf.id}, enabled=${wf.enabled})`);
  }
  if (!wf.enabled) {
    await api(`workflows:update?filterByTk=${wf.id}`, { method: 'POST', body: { enabled: true, current: true } });
    log('workflow enabled');
  }
  state.fixtures.workflow = { id: wf.id };

  // 5. smoke: API submit → lisi gets PENDING → destroy cleanup
  const approval = await api('approvals:create', {
    method: 'POST',
    body: { collectionName: 'leave_requests', workflowId: wf.id, status: 2, data: { leaveType: 'annual', days: 1, reason: 'seeder-smoke' } },
  });
  await new Promise((r) => setTimeout(r, 4000));
  const records = await api(`approvalRecords:list?${new URLSearchParams({
    filter: JSON.stringify({ approvalId: approval.id }),
    fields: 'userId,status',
  })}`);
  const lisiPending = records.some((r) => Number(r.userId) === Number(users.appr1.id) && Number(r.status) === 0);
  if (!lisiPending) throw new Error(`smoke failed: lisi has no PENDING record for approval ${approval.id}`);
  log(`smoke OK: approval ${approval.id} → lisi PENDING (records: ${records.map((r) => `${r.userId}:${r.status}`).join(', ')})`);
  // destroy 只收 DRAFT（actions.js SUBMITTABLE 语义）：先撤回回草稿再删
  await api(`approvals:withdraw?filterByTk=${approval.id}`, { method: 'POST', body: {} });
  await api(`approvals:destroy?filterByTk=${approval.id}`, { method: 'POST' });
  log('smoke approval withdrawn+destroyed (cleanup)');

  const fs = await import('node:fs');
  const outPath = new URL('./story-leave-state.json', import.meta.url).pathname;
  fs.writeFileSync(outPath, JSON.stringify(state, null, 2) + '\n');
  log(`state written to ${outPath}`);
  log('leave-story setup complete.');
}

main().catch((e) => {
  console.error('SETUP FAILED:', e.message);
  if (e.payload) console.error(JSON.stringify(e.payload));
  process.exit(1);
});
