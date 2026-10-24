# 15 · 用户故事一条龙：青禾科技请假审批（v3 AI portal + 收信箱）

> 批14（2026-10-22）。目标：以真实请假场景驱动「建表→建流→多角色→五操作→通知」
> 全链验证，并落地两个真实数据驱动的新组件（右上角收信箱、故事模式一键切换账号）。
> 环境：approval-v3-dev@13810（3.0.0-alpha.13），分支 feat/v3-ai-portal。

## 1. 人物与权限

| 账号 | 昵称 | 角色 | 故事身份 |
|---|---|---|---|
| admin@nocobase.com | 管理员 | root | 搭建（表/流/人/ACL） |
| zhangsan | 张三 | member | 研发工程师 · 申请人 |
| lisi | 李四 | member | 研发组长 · 一级审批 |
| wangwu | 王五 | member | 人事专员 · 二级审批 · 加签对象 |
| zhaoliu | 赵六 | member | 平级组长 · 转签对象 |

member 角色所需 ACL（审批插件已 `acl.allow(...,'loggedIn')` 自注册的资源之外）：
- `collections:get`（appends fields）——默认字段表单元数据通道，未授权时报「该工作流未配置可发起的表单」
- `leave_requests` view/create/update（scope=all）——编辑重提与审批人查记录走业务表直读

## 2. 数据与流程

- 表 `leave_requests`：leaveType(select 年假/事假/病假/调休)、startDate/endDate(date)、days(integer)、reason(textarea)
- 工作流两级：L1 组长审批（李四，会签 negotiation=1，actions [2,-1,1,8,99]，
  toDelegateReassignees=[赵六]，toAddReassignees=[王五,赵六]，todo 通知）→ L2 人事备案
  （王五，actions [2,1]，todo 通知）；trigger withdrawable + done 通知；渠道 leave-story（中文 custom 模板）
- 搭建脚本 `tools/story-leave.mjs`（幂等，仿 reseed-demo.mjs）

## 3. 走查结论（八单 × 五操作）

| 单据 | 操作链 | 终态 | 收信箱消息（张三/对应审批人） |
|---|---|---|---|
| #1 年假3天 | UI 全链提交 → 李四通过 → 王五备案 | 4 通过 | 李四 todo ✓；张三 Approved ✓ |
| #2 事假2天 | API 提交 → 李四拒绝 → （补丁前卡 PROCESSING/L2）→ 王五 L2 拒绝 | -1 拒绝 | 张三 Rejected ✓ |
| #3 调休1天 | UI 提交 → 李四退回 → 张三 UI 编辑重提 → 李四通过 → 王五备案 | 4 通过 | 张三 Returned + Approved ✓；重提后李四新 todo |
| #4 旧病假 | API 提交 → 李四通过 → 王五备案 | 4 通过 | 王五 L2 todo ✓ |
| #5 旧年假10天 | API 提交 → 李四拒绝 → 王五 L2 拒绝 | -1 拒绝 | 张三 Rejected ✓ |
| #6 调休1天 | API 提交 → 张三 UI 撤回 | 0 草稿 | 李四角标 -1（撤回后任务取消） |
| #4' 病假（转签演示） | UI 提交 → 李四转签赵六 → 赵六通过 → 王五备案 | 4 通过 | **赵六收转签 todo ✓（服务端补丁）** |
| #5' 年假10天（加签演示） | UI 提交 → 李四加签王五 → 李四/王五会签双批 → 王五备案 | 4 通过 | 王五 Added todo ✓；李四原任务保持 PENDING ✓ |

终局：5 通过 / 3 拒绝 / 1 草稿；张三收信箱 9 条未读（Approved×5 + Rejected×3 + Returned×1）。
截图：`docs/screenshots/v3-portal/story-leave-final.png`（收信箱 9 条 + 列表终态彩标）、
`phase1-story-switcher-open.png`、`phase2-inbox-panel.png`。

## 4. 新组件

### 4.1 右上角收信箱（inbox-bell.tsx）

- 数据：官方 `plugin-notification-in-app-message` 管线（审批服务端 notifications.js →
  notification-manager → `notificationInAppMessages` 表），非前端造假
- API：`myInAppMessages:count/list`（服务端强制 userId=self，member 放行实测）、
  `notificationInAppMessages:updateMyOwn`（values 白名单只有 status；id 为 uuid，数字 id 报
  `operator does not exist: uuid = integer`）
- UI：createPortal 注入 header 右控件区（找不到兜底 fixed）；未读角标 15s 轮询
  （todos-badge 同节奏）；面板最近 20 条、未读高亮、相对时间（receiveTimestamp 毫秒数，
  回退 createdAt——直插行为 null）；点条目=标已读+跳转（标题含「任务/todo」→ 待办页）
- 效果实测：角标 1→点条目→已读落库（count=0）+路由跳转；「全部已读」批量 status 翻转 1→0

### 4.2 故事模式切换账号（story-switcher.tsx）

- 门控：URL `?story=1` 点亮并持久化 localStorage；X 退出后 reload 不再出现
- 契约（复刻宿主 dingtalk auto-login-provider）：`auth:signIn(basic)` →
  setAuthenticator/setToken/setRole/clearAcl → 原路由整页刷新
- **关键坑（cookie 角色残留）**：同源 v3 设置页（旧版 admin SPA）把上一账号角色留在
  `nb_role_main` cookie，portal `getRole()` 在存储为空时回退读 cookie → 新 token 带着
  旧 X-Role → `ROLE_NOT_FOUND_FOR_USER` 踢回登录页且清 token。修复=角色显式双写
  （`setRole(account.role)` + `document.cookie` 覆盖）
- 实测：五账号往返各 ~1.07s（对比手动登出登入 ~30s）；13810 member 可达双页
  （13800 的 member 登录拦截问题在本环境不存在）

## 5. 发现并修复的插件缺陷（两个已修，两个记录）

1. **[已修 8f8cf20] 直通模式拒绝不终止**：route() 把 REJECTED 落 RESOLVED，引擎视为放行——
   L1 拒绝照常开出 L2、审批单卡 PROCESSING、done 不发。修复=job 置 REJECTED(-5)（引擎
   StatusMap 终态）+ 终态映射补 -5→-1。回归：L1/L2 拒绝均正确终态+done。
2. **[已修 d9a5a09] 转签/加签无通知**：sendTodo 只覆盖节点运行/顺序放行两个时点，
   delegate/add 直接建记录不在覆盖内。修复=建记录后补调 sendTodo（赵六/王五实测收到）。
3. **[记录] 节点 actions 枚举即按钮集**：转签/加签按钮由 config.actions 含 8/99 控制
   （docs/04 §7.4 syncProcessActionToNodeConfig）；API 建流漏配则按钮不出现。
4. **[记录] 已执行工作流节点锁定**：`Nodes in executed workflow could not be reconfigured`
   ——改配置须建新版本工作流；停用旧流会让在途单的重提（startRound）trigger 不跑
   （round executionId=None 悬挂），在途回收场景旧流必须保持 enabled。

## 6. 已知小问题（不阻断）

- done 消息 statusText 为官方英文常量（Approved/Rejected/Returned），中文模板里混排
- 日期字段显示带时区偏移（选 10-26 显示 2026-10-25 16:00:00，date 存 UTC 零点的展示层现象）
- 拒绝时意见字段 comment 未落 record.comment（#2 记录 comment=None，意见疑似未持久化，待查）
- 冒烟残留：搭建脚本三次冒烟给李四留了 3 条 todo 消息（收信箱 9=6+3 的来源）

## 7. 复跑指引

```bash
node tools/story-leave.mjs                # 幂等搭建（缺啥建啥）
# 浏览器：13810/x/main/approvals?story=1 → 右下角切换器换号 → 右上角收信箱收发
```
