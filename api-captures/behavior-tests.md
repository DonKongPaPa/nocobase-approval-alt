# workflow-approval 服务端行为实测记录

> 测试环境：官方限时 demo（实例已过期换址）（NocoBase 2.4.0-alpha.9.20261010023252，postgres）
> 测试时间：2026-10-13，root 身份（admin@nocobase.com），通过 curl 直接调用 API
> 测试方式：自建 lab collection + 两个 lab 工作流（标题 RE 前缀），测毕禁用工作流并删除 collection，未触碰 demo 业务数据

## 0. 调用约定（关键！）

来自 `@nocobase/sdk/lib/APIClient.js:159-190`（本地 npm 包，2.4.0-alpha.9）：

```js
const { values, filter, ...others } = params;
config.params = others;                 // filterByTk、appends、updateAssociationValues 等 → URL query
config.params.filter = JSON.stringify(filter); // filter → query 中的 JSON 字符串
// POST: config.data = values || {};    // values 对象 = POST body（扁平，不再包一层 values）
// 资源名带点 → 路径带所属记录：resource("approvalRecords.reassignees", id) → /api/approvalRecords/{id}/reassignees:list
```

- 数据源头：`setDataSourceKey(e){ this.addRequestHeader("X-Data-Source", e) }`（app client bundle），主数据源为 `main`
- 鉴权：`Authorization: Bearer <token>`（token 来自 `POST /api/auth:signIn`，头 `X-Authenticator: local`，body `{account, password}`）
- ⚠️ 自测教训：把 `values` 包一层或把 `filterByTk` 放 body 都会得到误导性错误（`Data source "" not found` / `Invalid status.` / `You are not assigned to this approval.`）

## 1. 提交审批（approvals:create）

请求：
```
POST /api/approvals:create          （X-Data-Source: main）
{ "collectionName": "xxx", "data": {…表单数据…}, "status": 2, "workflowId": 391754342203392 }
```

响应（节选）：
```json
{"data":{"id":391755128635392,"collectionName":"t_lonjyttymmu","data":{"id":1},"status":2,
 "workflowId":391754342203392,"workflowKey":"58uu3a5995o","applicantRoleName":"root",
 "action":{"values":{…原始请求…},"actionName":"create","resourceName":"approvals"},"dataKey":"1",…}}
```

实测结论：
- `status: 2`（SUBMITTED）直接提交；`status: 0`（DRAFT）存草稿
- **mode=0（数据保存前）**：服务端立即创建**空壳业务记录**（只有 id，表单字段不落库），`dataKey` 指向空壳；实测 title 字段为 null
- **mode=1（数据保存后）**：`approvals:create` 不创建业务记录，数据仅存 JSON（正常路径是业务表单先建记录再提交审批）
- 触发工作流：round（approvalExecutions）+ workflow execution + 每个审批人的 approvalRecord 全部异步生成（约 1-2s 内）
- `applicantRoleName` 记录申请人角色快照；`action` 字段记录提交动作摘要

## 2. 审批操作（approvalRecords:submit / return）

**同意**：`POST /api/approvalRecords:submit?filterByTk=<recordId>`，body `{ "status": 2, "comment": "…", "data": {…可修改的业务数据…} }` → **HTTP 202**
- 之后 `approval.status` → 4（APPROVED）；round.status → 1（完成）
- record.status → 2，comment 落库
- **mode=0 时 `values.data` 即通过后落库的数据**（审批人表单可改字段）；空 `{}` 会导致记录仍为空壳（实测复现）

**拒绝**：同端点 `{"status": -1, …}` → `approval.status` → -1（REJECTED），round.status → 1

**退回**：`POST /api/approvalRecords:return?filterByTk=<recordId>`，body `{"status":1,"comment":{…},"data":{},"returnToNodeKey":"<nodeKey 可选>"}`
- `approval.status` → 1（RETURNED）；round.status → **-6**
- record.status → 1
- `returnToNodeKey` 服务端校验：`returnToNodeKey must be one of the configured return nodes.`

**权限**：非被指派人提交 → 403 `You are not assigned to this approval.`（记录不存在时也是同一报错，无法区分）

## 3. 撤回（approvals:withdraw）

`POST /api/approvals:withdraw?filterByTk=<approvalId>` body `{}`（可带 `values.data` 保存表单）
- **`approval.status` → 0（回到 DRAFT，可重新提交或删除）**；round.status → **-4**（CANCELED 族）
- 撤回后 `approvals:destroy?filterByTk=` 可删除（草稿态才可删，非草稿 400）
- v1 客户端证据：withdrawable 并非配置项，而是**申请表单 schema 中是否存在 WithdrawActionProvider 装饰器**派生；撤回仅对 status=SUBMITTED(2) 且创建者可见

## 4. 重新提交（多轮次）

草稿/退回后：`POST /api/approvals:update?filterByTk=<approvalId>` body `{"status":2,"data":{…}}`
- **创建新 round**（approvalExecutions 新行）+ 该轮所有审批人的新 approvalRecord（index 从 0 重排）
- 旧轮记录保留（历史时间线），`approval.latestExecutionId` 指向新轮
- 实测：退回→重提后 rounds=[(旧,-6),(新,None)]，records 两条（旧 status=1，新 status=0）

## 5. 委派/转签（approvalRecords:delegate）

前置：**候选人范围**由节点配置 `toDelegateReassignees` 决定（数组元素可为用户 id 或 `{filter}`）；未配置时候选人为空，委派任何人都报 `Assignee is invalid.`
候选人查询：`GET /api/approvalRecords/<recordId>/reassignees:list?type=toDelegate&pageSize=200[&filter={"nickname":{"$includes":"x"}}]`

`POST /api/approvalRecords:delegate?filterByTk=<recordId>` body `{"assignee": 2}` → 202
实测结果：
- 原记录：status → **8（DELEGATED）**，type 保持 Normal
- 新记录：userId=2，status=0，**type="Delegated"**，prevRecordId=原记录 id，index=原+1
- **`approval.status` 2 → 3（PROCESSING）**

## 6. 加签（approvalRecords:add）

候选人：同上 `type=toAdd`，范围配置 `toAddReassignees`

`POST /api/approvalRecords:add?filterByTk=<recordId>` body `{"assignee":[2,3],"order":-1}` → **HTTP 205**
- 为每个新增者建 **type="Added"** 记录（status=0）
- `order: -1`=在我之前（Before Me），`1`=在我之后（After Me）；仅顺序审批（order=true）且 negotiation≠0 时有意义（Or 模式禁用 order）
- **实测 order=-1：新记录 index=0,1，原记录被重排为 index=2**；原记录保持 PENDING
- approval.status 同样 2 → 3

## 7. 配置面（服务端强制行为）

- `workflows:create` body 需扁平（type/title/config 在顶层），`values` 包装会报 `Trigger type is required`
- `flow_nodes:create` 同理；节点 config 实测可用：`{assignees:[1], negotiation:0, order:false, branchMode:true, actions:[2,-1,1,8,99], title, toAddReassignees, toDelegateReassignees}`
- `actions` 数组 = 节点允许的审批动作（值为 record status 枚举：2 通过 / -1 拒绝 / 1 退回 / 8 委派 / 99 加签）
- 工作流一旦执行过：`Nodes in executed workflow could not be reconfigured`（节点锁定，需复制新版本）
- 服务端校验退回目标：必须在节点配置的退回范围内（`returnToNodeKey must be one of the configured return nodes.`）

## 8. 周边端点（实测可用）

| 端点 | 用途 |
|---|---|
| `POST /api/approvals:listMine` | 我的申请（query 走 `__encoded__` base64；filter 如 `{"status":[0,1,2,3]}`） |
| `POST /api/approvalRecords:listMine` | 我的审批（filter 如 `{"status":0,"approval":{"status":[2,3]}}`） |
| `GET /api/approvals:get?filterByTk=&appends[]=` | 审批详情（装饰 createdBy/rounds/records） |
| `GET /api/approvalRecords:get?filterByTk=` | 记录详情（装饰 node/job/workflow/execution/user/approval/approvalExecution，含 dataBefore/dataAfter；demo 上孤儿记录会 500 `Cannot set properties of null (setting 'workflow')`，反证服务端会给 record 挂 `.workflow`） |
| `POST /api/workflows:listApprovalFlows` | 审批中心"申请"弹窗的可发起工作流（filter `{"config":{"centralized":true}}`） |
| `POST /api/userWorkflowTasks:listMine` | 统一任务箱（type ∈ [cc, manual, approval-apply, approval-todos]） |
| `POST /api/userWorkflowTaskStats:listMine` | 任务角标统计（type 分组） |
| `GET /api/flowModels:findOne?__encoded__={"uid":"…"}` | v2 flow-engine 模型配置（approvalUid/taskCardUid 指向的 uid） |
| `GET /api/uiSchemas:getJsonSchema/<uid>` | v1 申请表单/任务卡 schema |
| `GET /api/app:getLang[?locale=zh-CN]` | 全量 locale（含 `@nocobase/plugin-workflow-approval` 命名空间 364 keys） |
| `POST /api/collections:listMeta` | 集合元数据（**不含插件内置 collections**，approval 系列表被隐藏，无 name 过滤参数） |

## 9. 实测状态机（汇总）

```
approval.status:      0 DRAFT → 2 SUBMITTED → 3 PROCESSING → 4 APPROVED / -1 REJECTED
                      2 → 1 RETURNED →(update 2)→ 2 …；2 →(withdraw)→ 0
round.status:         None(进行中) → 1(完成: approved/rejected) / -6(退回) / -4(撤回取消)
record.status:        0 PENDING → 2 APPROVED / -1 REJECTED / 1 RETURNED / 8 DELEGATED / -3 WITHDRAWN
record.type:          Normal / Delegated（prevRecordId 链）/ Added
```

## 10. 探针实验（第二批，2026-10-13，为 1:1 实现摸底）

### P-A And 模式部分决定 → PROCESSING
negotiation=1, assignees=[1,2]，user1 通过 → `approval.status: 2→3`，records=[2, 0]。**PROCESSING(3)=轮次未决但有动作**。

### P-B 投票分母=全部审批人
negotiation=0.5, assignees=[1,2,3]，仅 user1 通过 → 1/3=33%<50% → 保持 PROCESSING(3)。**阈值按全体审批人计算，>N% 通过**。

### P-C 顺序审批（order=true）
assignees=[1,2]，t0：user1 st=0(PENDING)，user2 st=**null(ASSIGNED，等待轮转)**；user1 通过后 user2→0，approval→3。**顺序模式预建全部记录，非当前者为 ASSIGNED(null)**。

### P-G autoPassIfApplicant
触发器开启 + 审批人=申请人 → 提交后**无需动作直接 APPROVED(4)**，record st=2。

### P-H autoPassIfApprovedInRound
A(审批人[1]) → B(审批人[1])，通过 A 后 **B 自动通过**（本轮已通过者后续节点自动过）→ 直接 4。

### P-F/F2 审批人变量与查询条件
- `"{{$context.data.owner_id}}"`（提交数据含 owner_id:1）→ 为 user1 建记录 ✅ 变量按提交数据上下文解析
- `[{filter:{"id":1}}]` → user1 ✅
- **未解析/空审批人 → 节点自动通过**（无记录，approval 直接到 4）

### P-D mode=0 数据落库时机（quotations 真表）
- 提交（mode 0）→ 创建 shell 业务行（无字段值）
- 节点A通过（data: {quotation_no:"V1"}）→ 下游节点B记录 **dataBefore.qno=None**：**通过时不落库**
- 退回（data: {quotation_no:"RET"}）→ 回退后新记录 **dataBefore={}**：**退回也不落库**
- 每次 submit 的 values.data **整体替换** approval.data（后交覆盖先交；未知列被模型过滤清 null）
- 最终入库=流程结束时写最新 approval.data（官方文档明示"通过后才正式入库"）
- 注意：业务行经 API 读取受 demo multi-space 影响（curl 视角读不到 Team A 空间的行），判断依据用 dataBefore/snapshot 快照

### P-E 直通 vs 分支模式 / returnToNodeKey
- **直通模式(branchMode=false)**：审批节点即流程终点——通过=以 APPROVED 结束，拒绝/退回=直接退出。下游节点不可达
- **分支模式(branchMode=true)**：三条分支 **branchIndex: -1=Rejected / 1=Returned / 2=Approved**；通过分支上的节点会执行，主线下游在分支后继续
- **returnToNodeKey=目标节点key**：**同轮次回退**——execution 回到目标节点重新执行：目标节点新 record（PENDING）、round 不变（不建新轮）、approval 保持 PROCESSING；目标节点之后的节点会重新走一遍

## 11. 本地环境交叉验证（approvals-reverse @ 127.0.0.1:13800，同为 2.4.0-alpha.9）

商业插件本体无授权不可装（符合预期），验证的是审批所依赖的**开源引擎侧契约**：

- collection 事件工作流 + manual 节点：建表 → 建流 → 启用 → 建记录 → execution 生成 → `workflowManualTasks:listMine` 出现任务 ✅
- `workflowManualTasks:submit` 契约：`?filterByTk=<taskId>`，body `{result:{<formKey|"_">:{…}, "_":actionKey}}`，要求 form action 携带 status（forms 未配 action.status 时 400 Bad Request）——manual 聚合逻辑 `getSingleModeStatus/getAllModeStatus/getAnyModeStatus`（mode 0/1/-1 = 单人/会签/或签）即审批协商判定的直接参照（`plugin-workflow-manual/dist/server/actions.js`）
- 交叉一致的行为（demo 与本地相同）：API 建集合名被随机化为 `t_xxx`；工作流执行过一次后 `flow_nodes:update` 400 "Nodes in executed workflow could not be reconfigured"
- 本地 lab 已清理（工作流禁用、集合删除）

## 11. 未决项

- mode=0 通过后 data 是否/何时落库：官方文档明确"通过后才正式入库"；实测审批人 submit 的 `values.data` 即为提交数据（空 {} 导致记录仍为空壳——与文档一致）；最终写库的确切时机（submit 时 vs 流程结束）未单独验证
- approval.status 2→3（PROCESSING）的精确触发条件：实测 delegate 与 add 都会触发；是否还有其他触发点未穷举
- 投票模式（negotiation=0~1 小数）服务端判定：未实测（需 ≥3 审批人）；客户端证据充分（UI 显示 >N%，存分数）
