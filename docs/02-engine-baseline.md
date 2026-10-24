# 02 - NocoBase Workflow 开源引擎基线（v2.4.0-alpha.9）

> 目的：为逆向商业审批插件 `workflow-approval` 建立开源引擎行为基线。审批插件构建于本文所分析的 `plugin-workflow`（引擎核心）、`plugin-workflow-manual`（人工节点）、`plugin-workflow-cc`（抄送）之上。
> 素材：`~/approvals-reverse/source/node_modules/@nocobase/`（编译产物 `dist/`，可读，行号即以此目录为根）。
> 所有行号引用格式：`包名/dist/.../文件.js:行号`。标注【推断】的内容为基于开源实现的合理推测，需与商业插件产物比对验证。

---

## 1. Workflow 引擎核心模型（plugin-workflow）

### 1.1 collections 字段定义

四个核心表定义在 `plugin-workflow/dist/common/collections/`（`dist/server/collections/` 下的同名文件只是 re-export，如 `plugin-workflow/dist/server/collections/workflows.js:42-43`）。所有表主键均为 **snowflakeId**（雪花 ID，字符串形式存入 jobs.id）。

#### workflows（工作流版本表，`dist/common/collections/workflows.js:36-287`）

| 字段 | 类型 | 说明 | 行号 |
|---|---|---|---|
| id | snowflakeId PK | 版本 ID（工作流按 key 分组、按 id 修订） | 46-58 |
| key | uid | 工作流业务键（跨版本不变） | 59-62 |
| title | string | 名称 | 63-73 |
| enabled | boolean (默认 false) | 启用开关 | 74-89 |
| description | text | 描述 | 90-99 |
| type | string | **触发器类型**（trigger 注册名，如 collection/schedule/action/custom-action/manual 触发等） | 100-112 |
| triggerTitle | string | 触发器显示名 | 113-117 |
| config | jsonb (默认 {}) | **触发器配置**，结构由各 Trigger 决定 | 117-122 |
| invalid | boolean (默认 false) | 配置失效标记 | 123-127 |
| nodes | hasMany → flow_nodes (CASCADE) | 节点 | 128-133 |
| executions | hasMany | 执行记录 | 134-137 |
| executed / allExecuted | integer (默认 0) | 冗余计数（版本/全版本） | 138-147 |
| current | boolean | 当前版本标记 | 148-151 |
| sync | boolean (默认 false) | 同步/异步执行模式（同步模式阻塞触发请求直到执行结束） | 152-175 |
| revisions | hasMany → workflows (foreignKey: key, sourceKey: key, 无约束) | 版本链 | 176-185 |
| options | jsonb (默认 `{timeout: 0}`) | 引擎选项：`timeout`（超时 ms）、`stackLimit`（嵌套调用上限）、`deleteExecutionOnStatus` | 186-192；类型见 `dist/server/types/Workflow.d.ts:23-28` |
| stats / versionStats | hasOne → workflowStats / workflowVersionStats | 统计 | 193-233 |
| categories | belongsToMany workflowCategories (through workflowCategoryRelations) | 分类 | 234-260 |
| createdBy | belongsTo users | 创建者 | 261-278 |

唯一索引 `(key, current)`，注释说明用于避免 MySQL 设置 current 时的死锁（`workflows.js:280-286`）。版本机制：`WorkflowRepository.revision()`（`dist/server/repositories/WorkflowRepository.js:45`）复制当前版本为新 id，触发器/各 instruction 的 `duplicateConfig` 负责深拷贝配置（如 uiSchema uid），见 `WorkflowRepository.js:77-78, 99-100`。

#### executions（执行实例表，`dist/common/collections/executions.js:36-205`）

| 字段 | 类型 | 说明 | 行号 |
|---|---|---|---|
| id | snowflakeId PK | | 42-55 |
| workflowId | bigInt | 指向**版本** id | 56-67 |
| workflow | belongsTo workflows | | 68-86 |
| key | string | 冗余 workflow.key | 87-90 |
| eventKey | string (unique) | 事件去重键（默认 UUID，见 Dispatcher） | 91-95 |
| jobs | hasMany (CASCADE) | | 96-100 |
| context | json | 触发上下文（trigger 事件数据） | 101-104 |
| status | integer | 执行状态，见 1.2 | 105-116 |
| reason | string | 终止原因（timeout / manual_cancel / parent_aborted） | 117-127 |
| dispatched | boolean (默认 false) | 是否已入队处理 | 128-132 |
| parentExecutionId | bigInt | 嵌套执行父级（stack 防环） | 133-148 |
| stack | json | 父执行 id 栈 | 145-148 |
| output | json | 输出 | 149-152 |
| startedAt / expiresAt / createdAt | datetime | 开始/超时时间/触发时间 | 153-186 |
| manually | boolean | 是否手动触发 | 187-198 |

索引：`(dispatched,id)`、`(status,expiresAt)`、`(parentExecutionId,status)`（`executions.js:200-204`）。

#### flow_nodes（节点表，`dist/common/collections/flow_nodes.js:36-101`）

节点用**双向链表 + 分支子表**组织，而非树：

| 字段 | 类型 | 说明 | 行号 |
|---|---|---|---|
| id | snowflakeId PK | | 39-44 |
| key | uid | 节点键（变量引用与 job 索引的键） | 45-48 |
| title | string | | 49-58 |
| workflow | belongsTo workflows | | 60-63 |
| upstream | belongsTo flow_nodes | 链表前驱 | 64-69 |
| branches | hasMany flow_nodes (foreignKey: upstreamId) | 下游节点集合（自反） | 70-75 |
| branchIndex | integer | **仅当上游是分支型节点时**非空：标识自己是上游的第几条分支 | 76-82（注释明言"flow-links model 暂不必要"） |
| downstream | belongsTo flow_nodes | 链表后驱（分支结束后回到主流） | 83-90 |
| type | string | instruction 注册名 | 91-94 |
| config | json (默认 {}) | 节点配置 | 95-99 |

分支结构约定：分支头节点 `upstreamId = 分支父节点.id && branchIndex = n`；分支尾节点 `downstreamId = 主流下一节点.id`。节点增删改的链表维护逻辑见 `plugin-workflow/dist/server/actions/nodes.js:98-297`（create 时自动设置 `downstreamId`/后续节点 `upstreamId`，146-178）、`destroyBranch`（301-330 `searchBranchNodes`）。

#### jobs（节点执行结果表，`dist/common/collections/jobs.js:36-91`）

| 字段 | 类型 | 说明 | 行号 |
|---|---|---|---|
| id | bigInt PK（**非自增**，由引擎 snowflake 生成） | | 42-47 |
| status | integer | job 状态，见 1.2 | 48-51 |
| execution | belongsTo executions | | 52-55 |
| node / nodeKey | belongsTo flow_nodes / string | | 56-64 |
| upstream | belongsTo jobs | 上游 job | 65-70 |
| meta | json | instruction 自定义元数据 | 71-73 |
| result | json | instruction 结果 | 74-77 |
| startedAt | datetime | | 78-81 |
| log | text (@experimental) | | 82-88 |

索引 `(status, id)`（`jobs.js:90`）。

#### 任务中心辅助表（引擎自带，审批中心很可能复用同一机制）

- `userWorkflowTasks`（`dist/common/collections/userWorkflowTasks.js:36-68`）：`userId` + `type`（任务类型字符串）+ `stats`（json `{pending, all}`），唯一索引 `(userId, type)`。每用户每类型的任务计数缓存。
- `userWorkflowTaskStats`（`dist/common/collections/userWorkflowTaskStats.js:36-`）：`userId, workflowKey, type, pending, all`，唯一索引 `(userId, workflowKey, type)`。**type 是开放字符串**，任何插件可通过 `registerTaskStatsProvider(type, provider)` 接入（商业审批插件的 approvalRecords 计数【推断】即走此通道）。

### 1.2 状态枚举（`plugin-workflow/dist/server/constants.js:35-55`）

```text
EXECUTION_STATUS（executions.status，引擎映射自 job 状态）:
  QUEUEING: null    // 刚创建未入队
  STARTED: 0        // 进行中
  RESOLVED: 1       // 成功结束
  FAILED: -1        // 业务失败
  ERROR: -2         // 系统错误
  ABORTED: -3       // 中止（超时/手动取消/父级中止）
  CANCELED: -4      // 取消
  REJECTED: -5      // 拒绝（人工语义）
  RETRY_NEEDED: -6  // 需重试

JOB_STATUS（jobs.status）:
  PENDING: 0        // 等待（人工节点挂起的形态）
  RESOLVED: 1
  FAILED: -1
  ERROR: -2
  ABORTED: -3
  CANCELED: -4
  REJECTED: -5
  RETRY_NEEDED: -6
```

映射关系 `Processor.StatusMap`（`dist/server/Processor.js:58-67`：JOB→EXECUTION 同名对应，`PENDING→STARTED`）。EXECUTION_REASON（`dist/common/constants.js:34-38`）：`TIMEOUT / MANUAL_CANCEL / PARENT_ABORTED`。

> **审批插件对照**：审批记录的"审批中/通过/拒绝/撤回"状态机几乎必然沿用/扩展 `JOB_STATUS` 数值语义（正数=通过方向、0=进行、负数=终止方向），因为引擎按 `Math.sign(status)` 判断流转（`Processor.js:515`）。【推断】

### 1.3 服务端插件对象（`dist/server/Plugin.d.ts`）

`PluginWorkflowServer` 持有四个注册表（`Plugin.d.ts:49-51`）：
- `instructions: Registry<InstructionInterface>` — 节点指令
- `triggers: Registry<Trigger>` — 触发器
- `functions: Registry<CustomFunction>` — `$system` 变量函数
- `enabledCache: Map<number, WorkflowModel>` — 已启用工作流内存缓存（所有触发路径只查缓存，`ActionTrigger.js:125`、`CustomActionTrigger.js:97` 均如此）

关键 API：
- `registerTrigger(type, trigger)` / `registerInstruction(type, instruction)`（`Plugin.d.ts:86-91`；实现 `Plugin.js:265-283`，二者都支持传实例或类）
- `trigger(workflow, context, options)` → 入队（`Plugin.js:451-453` → Dispatcher）
- `execute(workflow, values, options)` → 委托 `trigger.execute()` 手动执行（`Plugin.js:518-527`）
- `resume(job)`（`Plugin.js:468-496`）：**保存 job 变更 + 入队 `{executionId, jobId}` 唤醒**。注释（`Plugin.d.ts:106-112`）明确写道："PENDING resume calls are valid for instructions such as **delay and sequential approval**；聚合多个用户动作的调用方必须只在原子更新把 job 从 PENDING 变为终态时调用" —— 这是商业审批会签/或签的官方集成点。
- `rerun(execution, {nodeId, overwrite})`（`Plugin.js:454-456`）、`start(execution)` 延迟启动（501-511）
- `registerTaskStatsProvider(type, {collectTaskStats})`（`Plugin.js:544-546`）、`updateTaskStatsByWorkflow()`（657-672，写 stats 后经 `ws:sendToUser` 推送 `workflow:taskWorkflowStats:updated`，645-655）
- 内建注册（`Plugin.js:284-301`）：triggers `collection`/`schedule`；instructions `calculation, condition, multi-conditions, end, output, create, destroy, query, update`
- 启动时恢复（`Plugin.js:156-186`）：加载所有 enabled workflow 进缓存、每 5 分钟 `dispatcher.recover()`（175-177）、`timeoutManager.load()`

版本切换钩子（`Plugin.js:100-151`）：`onBeforeSave` 保证同 key 只有一个 current 版本、新版本置 current 时旧版本强制 `enabled=false, current=null`；`onAfterCreate/Update` 调 `toggle()` 维护 enabledCache。

### 1.4 执行流水线（Dispatcher + Processor）

**Dispatcher**（`dist/server/Dispatcher.js`）：
- `trigger(workflow, context, options)`（91-125）：异步路径先查本进程 `events` 数组按 `eventKey` 去重（102-108），同步 workflow 直接走 `triggerSync`（116），否则入内存事件队列。
- `createExecution`（360-414）：`trigger.validateEvent` → 嵌套栈校验（`workflow.options.stackLimit`，328-351）→ `workflow.createExecution({context, key, eventKey: options.eventKey ?? randomUUID(), stack, parentExecutionId, dispatched: deferred, status: QUEUEING|STARTED, manually})`（383-392）→ `workflow.stats/versionStats.increment('executed')`（398-411）。
- `process(execution, job|null, {rerun})`（541-576）：`dispatched=false` 时置 `dispatched=true, status=STARTED`（546-548）→ 创建 Processor → 按 `rerun/job/start` 三种入口驱动 → 全程持有 `getExecutionLockKey(executionId)` 的 lockManager 排他锁（570-575，60s）。`options.deleteExecutionOnStatus` 命中时删除 execution（556-558）。

**Processor**（`dist/server/Processor.js`）——单次执行的状态机：
- `prepare()`（208-239）：加载 workflow+nodes 建双向链表（`makeNodes` 183-196）；**jobs 按 `GROUP BY executionId,nodeId 取 MAX(id)`**（223-230）→ **同一节点多次产生的 job 只取最新一条**作为该节点的当前状态（多 job 机制的读取侧；写侧每次 `saveJob` 都插新行）。
- `start()`（240-266）：找无 upstream 的头节点 `run(head)`。
- `run(node, input)`（406-419）：`instructions.get(node.type)` → `exec(instruction.run, node, prevJob)`。
- `exec()`（345-405）：调用 instruction，返回值三态——
  - `IJob`：`saveJob` 持久化（内存暂存，exit 时批量落库）；status=RESOLVED 且有 downstream → `run(downstream)`；否则 `end(node, job)`。
  - `null`：`exit()` 终止整个执行（end 节点语义）。
  - `void`：`exit(true)` 什么都不做（**instruction 自行挂起等待 resume 的形态**，manual/parallel 的 run 返回的就是已 PENDING 的 job，等价处理）。
  - 异常：超时错误→ABORTED job，其他→ERROR job（359-384）。
- `end()`（421-432）：`findBranchParentNode`（754-761，沿 upstream 找第一个 `branchIndex !== null` 的节点的上游）存在 → `recall(parentNode, job)` 把控制权交还分支父节点；否则 `exit(job.status)` 结束执行。
- `recall()`（433-448）：调用 `instruction.resume(node, job)`，再走 `exec` 相同流转（resume 返回 RESOLVED job 则继续 downstream）。
- `exit()`（449-544）：处理作用域事务回滚/提交（459-460、580-645）；`jobsToSave` 批量落库（新 job `bulkCreate`，已有 job 仅 UPDATE 变更列，463-513）；按 `StatusMap[s] ?? Math.sign(s)` 更新 execution.status（514-533，乐观条件 `WHERE status=STARTED`）；调度/清除超时定时器（534-539）。
- 超时体系：`ExecutionTimeoutManager`（`dist/server/ExecutionTimeoutManager.d.ts`：`isExpired/abort/abortExecutionIfExpired/shouldContinue`），`Processor.createBackgroundAbortHandle()`（128-170）供 fire-and-forget 的挂起指令在后台继续受 `expiresAt` 约束——**这是审批超时自动通过的挂点**【推断】。
- resume 入口（267-283）：`prepare()` 后 `recall(nodesMap.get(job.nodeId), job)`。

**API 面（`dist/server/actions/`，`actions/index.js:57-76` 注册）**：
- `workflows:list/create/update/destroy/revision/sync/execute`（`actions/workflows.js:76-235`；`revision` 162-173 创建新版本，`execute` 190+ 手动执行可 `autoRevision`）
- `workflows.nodes:create`；`flow_nodes:update/destroy/destroyBranch/duplicate/move/test`
- `jobs:resume`（`actions/jobs.js:47-86`）：**通用人工恢复 API** —— 取 job → 校验 execution STARTED 且未超时（65-70）→ 持 `getExecutionLockKey` 锁 `job.update(values)`（72-75）→ 202 响应后 `plugin.resume(job)`（85）。ACL 未显式放行（仅 `userWorkflowTasks:listMine`、`userWorkflowTaskStats:listMine` 对 loggedIn 开放，`Plugin.js:397-398`），默认需角色授权。
- `executions:destroy`（仅非 STARTED，`actions/executions.js:49-57`）、`cancel`（59-85，`abortExecution(reason=MANUAL_CANCEL)`）、`rerun`（87-109）

---

## 2. Instruction 接口与节点生命周期

接口定义：`plugin-workflow/dist/server/instructions/index.d.ts`

```text
IJob { status: number; result?: unknown; log?: string }                     // 14-19
InstructionResult = IJob | null | void                                       // 20-28
Runner = (node, input, processor, options?: {rerun?, signal?}) => result     // 29-32
InstructionInterface {                                                       // 33-43
  run: Runner                          // 必需：执行节点
  resume?: Runner                      // 可选：从 PENDING job 恢复（人工/延时类）
  getScope?: (node, data, processor)   // 可选：为下游暴露分支作用域变量（loop/parallel 用）
  duplicateConfig?: (node, {origin})   // 可选：版本复制时深拷贝配置
  validateConfig?: (config) => errors  // 可选
  isAvailable?: (workflow, node)       // 可选
  test?: (config) => IJob              // 可选：配置测试
}
abstract class Instruction { run(); validateConfig() }                       // 44-53
```

**服务端生命周期**（`Processor.js`）：
1. 引擎按 `node.type` 取 instruction，`run(node, prevJob, processor, {signal})`（`Processor.js:406-419`）。
2. instruction 内部调 `processor.saveJob(payload)`（649-690）：payload 为普通对象时分配 snowflake id 新建 job；PENDING 状态的 job **先在内存暂存**，`exit()` 时落库。`saveJob` 同时把结果写进 `jobsMapByNodeKey`/`jobResultsMapByNodeKey`（684-685），供下游变量 `$jobsMapByNodeKey` 引用。
3. 返回 PENDING job 即挂起；外部（HTTP action、定时器等）改 job 状态后调用 `plugin.resume(job)` → 入队 → 新 Processor 实例 `resume(job)` → `recall` 调 `instruction.resume(node, job)`。
4. **单节点多 job 机制**：写侧不限制，读侧 `prepare()` 按 `MAX(id)` 只装最近 job（223-230）。parallel 分支的每个分支尾 job 会以 `upstreamId` 链回父 job。rerun `overwrite` 模式复用原 targetJob（`saveJob` 658-666），否则插新 job。

**branch（分支）机制 —— approval 节点 branchMode 的引擎基础**：

- 结构层：分支 = 若干 `upstreamId=父节点.id, branchIndex=n` 的子链，分支尾 `downstreamId` 接回主流（§1.1 flow_nodes）。
- 引擎层：`getBranches(node)`（694-696，按 branchIndex 排序）、`end()` 回收（421-432）、`findBranchStartNode/ParentNode/LastJob`（736-790）。
- 参照实现 `plugin-workflow-parallel`（`plugin-workflow-parallel/dist/server/ParallelInstruction.js`）：
  - `PARALLEL_MODE = {ALL, ANY, RACE, ALL_SETTLED}`（46-51）；`Modes` 定义各模式的"是否继续下一条分支"谓词 `next()` 与聚合函数 `getStatus(分支状态数组)`（53-100）。
  - `run`（111-130）：`saveJob({status: PENDING, result: Array(branches.length).fill(null)})` → 依次 `processor.run(branchHead, job)`，用 `findBranchLastJob` 取分支尾 job 状态。
  - `resume`（131-155）：从分支 job 回溯父 job，`result[branchIndex] = branchJob.status`，`Modes[mode].getStatus(newResult)` 决定父 job 新状态；仍 PENDING 则 `saveJob` 后返回 `null`（继续等），终态则返回父 job（引擎继续 downstream）。
- **审批多分支（通过/拒绝/驳回分支）【推断】**即同一机制的定制：approval instruction 在 resume 中按表决结果决定从哪条 branchIndex 继续或直接返回终态 job。商业插件代码中的 branchMode 配置应对应 `node.config` 中的分支聚合模式。

---

## 3. manual 人工节点（plugin-workflow-manual）—— approval 的参照物

### 3.1 ManualInstruction（`dist/server/ManualInstruction.js`）

- `run(node, prevJob, processor)`（52-79）：
  1. `assignees = [...new Set(processor.getParsedValue(config.assignees, node.id).flat().filter(Boolean))]`（54）—— **assignees 支持变量表达式**，解析后去重。
  2. `saveJob({status: assignees.length ? PENDING : RESOLVED, result: mode ? [] : null, nodeId, nodeKey, upstreamId: prevJob?.id ?? null})`（55-61）—— 无审批人直接通过；有审批人则 job 挂起。
  3. title 可配置模板（65），为每个 assignee 建一条 `workflowManualTasks`（`createMany`，66-77）：`{userId, jobId, nodeId, executionId, workflowId, status: PENDING, title}`。
- `resume(node, job, processor)`（80-83）：仅日志，**返回 job 本身**——状态已在 action 里被改好，引擎据此继续 downstream。

### 3.2 配置结构（node.config）

- `mode`：0=单人（任一人提交即定稿，默认）、1=全签（all）、-1=或签（any）（`dist/server/actions.js:77,91`）。
- `assignees`：变量数组；`title`：模板；`forms`：`{[formKey]: {type: 'create'|'update', dataSource, collection, actions: [{key, status, values}]}}`（submit 消费，见下）。
- formTypes 注册：`forms/index.js:44-47` —— `create`/`update` 两个 handler，提交时把表单结果写入目标 collection（`forms/create.js:37-50`、`forms/update.js:37-50`，均带 `context: {executionId}` 与 createdBy/updatedBy=task.userId）。

### 3.3 表决/会签统计（`dist/server/actions.js`）

- `updateJobByManualTasks(job, node, db, latestTask, tx)`（76-99）：取该 job 全部 tasks → 按 status 分桶 `distribution` →
  - `mode===1`（全签）：全部 RESOLVED → RESOLVED；存在任一负状态 → 该负状态（57-64）
  - `mode===-1`（或签）：任一 RESOLVED → RESOLVED；负状态数==总人数 → REJECTED（65-75）
  - `mode===0`（单人）：第一个非 PENDING 的状态（53-56）
  - `result`：多 Assignee 模式存 `getSubmittedRatio`（已提交比例，46-52），单人模式存最后提交人的 result（95）。
- **提交动作 `submit`**（100-229，即 `workflowManualTasks:submit`）：
  1. 鉴权：需登录（106）；`getPresetValues` 内校验 `assignees.includes(currentUser.id) && task.userId === currentUser.id` 否则 403（147-149）。
  2. 前置校验（131-134）：`task.status===PENDING && task.job.status===PENDING && execution.status===STARTED`、execution 未超时（127-129 调 `timeoutManager.abort`）、action 必须声明 `status`。
  3. 变量作用域（150-163）：`currentUser/currentRecord/currentTime`（废弃）+ `$user`/`$nForm`(表单值)/`$nDate.now`，action `values` 经 `getParsedValue` 解析。
  4. 并发控制（190-214）：`lockManager.tryAcquire(getJobLockKey(job.id))`（键格式 `workflow:job:{jobId}`，`plugin-workflow/dist/server/utils.js:45-47`）内 60s 排他；主数据源走事务（sqlite 用 IMMEDIATE，139）。
  5. 提交后：`task.save` → `updateJobByManualTasks` → `shouldResume = job.status !== PENDING`（212）→ 响应 202 后 `plugin.resume(task.job)`（224-228）。
- `listMine`（230-252）：强制 `filter: {userId: 当前用户}`。

### 3.4 集合、ACL 与任务统计

- `workflowManualTasks`（`dist/server/collections/workflowManualTasks.js:44-113`）：`jobId`(belongsTo jobs, primaryKey:false)、`userId`(belongsTo users)、`title`、`executionId`(CASCADE)、`nodeId`、`workflowId`(CASCADE)、`status` integer、`result` jsonb。
- ACL（`dist/server/Plugin.js:258`）：`acl.allow('workflowManualTasks', ['listMine','get','submit'], 'loggedIn')`。
- Instruction 注册与统计（`Plugin.js:259-267`）：`registerInstruction('manual')`；`registerTaskStatsProvider('manual', …)`；db 钩子 `workflowManualTasks.afterCreateWithAssociations/afterUpdate/afterDestroy` 刷 stats（264-266）；`executions.afterUpdate` → execution ABORTED 时把 PENDING tasks 批量置 `TASK_STATUS.ABORTED`（197-241）。
- 任务状态枚举（`dist/common/constants.js:36-43`）：`TASK_STATUS = {PENDING:0, RESOLVED:1, ABORTED:-3, REJECTED:-5}`（注意是 JOB_STATUS 的子集）。`TASK_TYPE_MANUAL='manual'`。

> **审批对照**：商业 approvalRecords 表结构与 workflowManualTasks 高度同构（userId/jobId/nodeId/executionId/workflowId/status/result + 自有扩展字段）【推断】；"依次审批"（sequential approval）即引擎 `resume()` 注释点名的能力（§1.3），开源 manual 未实现，靠逐个改 task 再 resume job 即可表达。

---

## 4. Trigger 接口与 action / custom-action 触发器

接口：`plugin-workflow/dist/server/triggers/index.d.ts:14-30`

```text
abstract class Trigger {
  on(workflow)/off(workflow)                        // enable/disable 时订阅/退订事件源
  validateEvent(workflow, context, options)         // 事件是否应触发（入 execution 前调用）
  duplicateConfig?(workflow, {origin})              // 版本复制
  validateConfig(config)/configSchema               // Joi 校验
  validateContext?(values, workflow)                // trigger 载荷校验
  sync?: boolean
  execute?(workflow, values, options)               // 手动执行（workflows:execute 用）
}
```

`on/off` 参照：CollectionTrigger 在 `on()` 里对数据源 `db.on('collection.create', listener)`（`plugin-workflow/dist/server/triggers/CollectionTrigger.js:224-257`）。

**workflow.config 结构**：即 `workflows.config` jsonb，完全由各 Trigger 的 configSchema 约束。引擎不解释其内容。

**action-trigger**（`plugin-workflow-action-trigger/dist/server/ActionTrigger.js`，`TYPE='action'`，58）：
- config：`{collection, global?, actions?, appends?}`（configSchema 59-61 只强制 collection）。
- 挂载方式：构造时 `app.dataSourceManager.use(async ctx => { await next(); if (['create','update'].includes(actionName)) … })` **后置中间件**（72-79）——动作完成后扫描 `enabledCache` 中 `type==='action'` 且 collection 匹配的 workflow。
- 请求参数 `triggerWorkflows`（123-124）：`"workflowKey!dataPath,..."` 指定触发哪些工作流及数据路径；`config.global` 的工作流按 `config.actions` 匹配自动触发（134-141）。
- 同步/异步分组（153-217、218-308）：sync workflow 用 `this.workflow.trigger(workflow, event, {httpContext: ctx})` **内联执行并拿回 processor**；RESOLVED 且最后节点为 `end` 类型 → 拦截请求链（243-250）；失败 → 500；仍 STARTED（挂起）→ **500 "Workflow on your action hangs"**（274-278）。async 工作流在响应结束后延迟 200ms 触发（282-308）。
- 事件上下文：`{data: 记录 JSON, user: desensitize(currentUser), roleName}`（117-122、200）。`execute()`（309-351）支持非 HTTP 手动重放。

**custom-action-trigger**（`plugin-workflow-custom-action-trigger/dist/server/CustomActionTrigger.js`，`TYPE='custom-action'`）：
- config：`{type: 0|1|2, collection?, appends?}`；`CONTEXT_TYPE = {GLOBAL:0, SINGLE_RECORD:1, MULTIPLE_RECORDS:2}`（`dist/common/constants.js:34-39`）。
- 挂载方式：为**每个数据源**注册显式 action handler `trigger`/`triggerNew`（199-227），ACL 需 `workflows:trigger` loggedIn（228）+ 角色授权。即**由前端按钮显式调用 `resource:trigger` 发起审批类流程**。
- 与 action-trigger 的差异：① 显式触发（按钮）vs create/update 后置钩子；② 无 global/actions 自动匹配，必须 `triggerWorkflows` 参数点名（123-125）；③ 支持 GLOBAL 自定义 JSON 上下文与多记录数组上下文（167-187）；④ 同样有 sync 拦截/end 语义（processEvents 240-313）与 200ms 异步调度（314-340）。
- 事件上下文同为 `{data, user, roleName}`（108、188）。

> **审批提交入口对照**：审批提交是"按钮发起 + 自定义上下文（表单/记录）+ 可能拦截原请求（拒绝时）"，与 custom-action-trigger 的 `trigger` action 模式最接近；商业插件【推断】注册了自己的 trigger type（如 `approval`）或复用该模式并附加审批表单 schema（`trigger-workflow-action-schema` 迁移名暗示了 schema 化配置，`plugin-workflow-custom-action-trigger/dist/server/migrations/20250228142643-trigger-workflow-action-schema.js`）。

---

## 5. workflow-cc 抄送插件（开源，完整行为）

- Instruction（`dist/server/CCInstruction.js`）：`type='cc'`（55）。`run`（56-80）：**立即返回 RESOLVED job**（抄送不阻塞流程，58-63）；解析 `node.config.users`（变量表达式，64；元素可为用户 id 或 `{filter}` 用户查询对象，36-53）；批量建 `workflowCcTasks`：`{userId, jobId, nodeId, executionId, workflowId, status: UNREAD(0), title}`（66-78）。`duplicateConfig`（81-108）深拷贝 `ccDetail`（uiSchemas）与 `ccUid/taskCardUid`（flowModels）——**抄送卡片是 FlowModel/UISchema 驱动的**。
- 集合 `workflowCcTasks`（`dist/common/collections/workflowCcTasks.js`）：与 manual tasks 同构（jobId/userId/title/executionId/nodeId/workflowId/status + `readAt`，134）。
- API（`dist/server/actions.js:49-111`，注册 `workflowCcTasks:*`，121-125）：
  - `get`：强制 `filter: {userId: 当前用户}`（50-57）
  - `listMine`：userId 过滤 + 强制 appends `['node','workflow','workflow.nodes']` + 临时关联字段（58-68）
  - `read`：校验归属（77-79）→ `filter {userId, status:0}` + `values {status:1, readAt: now}` 的 update（81-92）
  - `unread`：反向（94-110）
- ACL（`dist/server/plugin.js:180`）：`['list','listMine','get','read','unread','readAll']` loggedIn。
- 统计：`registerTaskStatsProvider('cc')`（183-185），UNREAD 视为 pending；同样挂 afterCreate/Update/Destroy 钩子刷数（186-188）。

> **approvalAudiences 对照**【推断】：审批插件多受众（审批人/抄送人/相关人）记录表大概率仿照 `workflowCcTasks`：同一 job 挂多种 audience 类型行，"审批中心"列表 = userId 过滤 + workflow/node appends；任务中心徽标走 `userWorkflowTaskStats` 的 type 维度。

---

## 6. 变量系统

- 解析入口：`Processor.getParsedValue(value, sourceNodeId, {additionalScope, includeSelfScope})`（`Processor.js:827-834`）：`parse(value)`（`@nocobase/utils` 的 mustache 风格模板）→ `getScope` → 对模板用到的 key `appendArrayColumn(scope, key)`（`@nocobase/evaluators`，支持数组路径下钻）→ `template(scope)`。
- 作用域 `getScope`（794-823）：
  - `$context` = `execution.context`（触发上下文）
  - `$jobsMapByNodeKey` = 各节点最新 job.result（`node.key → result`）
  - `$system` = `plugin.functions` 注册的系统函数（内建：`now`、`dateRange.*` 系列，`dist/server/functions/index.js:112-120`）
  - `$scopes` = 沿分支父链调用各 instruction 的 `getScope()`（loop/parallel 暴露分支内变量）
  - `$env` = `app.environment.getVariables()`（环境变量插件）
  - 兼容别名 `ctx` = 整个 scope 对象（2.0，818-821）
- instruction 运行时可注入额外作用域：manual submit 的 `$user/$nForm/$nDate.now`（manual `actions.js:150-163`）。
- **assignees 变量表达式**（审批人配置）即 `getParsedValue(config.assignees, node.id)`（manual `ManualInstruction.js:54`；CC `CCInstruction.js:64`），支持 `$context.data.user`、`$jobsMapByNodeKey.xxx`、`$system` 函数等；`.flat().filter(Boolean)` + Set 去重。

---

## 7. flow-engine 客户端基础（plugin-flow-engine，v2 客户端底座）

- 服务端（`plugin-flow-engine/dist/server/`）：
  - `flowModels` 集合（`collections/flowModels.js:36-`）：`uid` PK、`name`、`options` json（`magicAttribute: 'options'`、`repository: FlowModelRepository`、`model: FlowSchemaModel`）——**FlowModel 实例以 JSON options 持久化**。
  - `flowModelTreePath`（闭包表：`ancestor/descendant/depth/async/type/sort`，`collections/flowModelTreePath.js:36-`）维护 FlowModel 树。
  - `dao/ui_schema_node_dao.js`、`actions/ui-schema-action.js`、`variables/`（record-bindings、allow-list 等）提供 UISchema↔FlowModel 桥接与变量白名单。
- 客户端：本包 `dist/client/index.js` 仅是空壳 Plugin（`client/index.d.ts:9-14`）；真正的 FlowModel 运行时随 `@nocobase/client` 发布（服务器 bundle 中不可见）。v2 workflow 客户端通过单例 `flowEngine` 注册节点 UI：`plugin-workflow/dist/client-v2/index.js` 中可见 `flowEngine.registerInstruction("calculation"|"condition"|"end"|"output"|"query"|"create"|"update"|"destroy"…)`（12 处）与 `useFlowEngine()`（25 处）。
- **含义**【推断】：商业审批插件的客户端（审批节点设计器、审批中心卡片）基于 FlowModel 体系扩展——注册自定义 FlowModel 子类/instruction 组件，服务端只需持久化其 options（cc 节点的 `ccUid/taskCardUid` 即此模式的实例，§5）。

---

## 8. 与审批插件的推断集成点清单

基于上述开源基线，商业 `workflow-approval` 服务端必须实现（★=有开源直接对应；▲=部分对应/推断；●=纯推断）：

| # | 集成点 | 依据/参照 |
|---|---|---|
| 1 | **Trigger 注册**：`registerTrigger('approval'|…, Trigger)` 或复用 custom-action-trigger 模式（`trigger` action + triggerWorkflows 参数 + sync 拦截） | ▲ §4；CustomActionTrigger.js:117-229 |
| 2 | **ApprovalInstruction**：`registerInstruction('approval', …)`；`run()` 创建 PENDING job（无审批人则 RESOLVED）+ 每审批人一条记录；`resume()` 按表决聚合返回终态 job | ★ manual run/resume（§3.1）；引擎三态返回语义（§2） |
| 3 | **job↔审批记录绑定**：approvalRecords 表 `jobId` belongsTo jobs（primaryKey:false），job.meta/result 存聚合信息 | ★ workflowManualTasks/workflowCcTasks 同构（§3.4/§5） |
| 4 | **会签/或签/依次审批**：逐 task 更新后聚合并**仅在 PENDING→终态时**调用 `plugin.resume(job)`；依次审批即引擎注释点名的 sequential approval | ★ Plugin.js resume 注释（Plugin.d.ts:106-112）；manual mode 0/1/-1（§3.3） |
| 5 | **branchMode 多分支**：approval 节点带分支子节点（branchIndex），resume 按结果选择分支或终态；`getBranches/end/recall/findBranchLastJob` 复用 | ★ parallel 实现（§2）；Processor.js:694-790 |
| 6 | **提交/表决动作的并发与校验**：`lockManager.tryAcquire(getJobLockKey(jobId))`、状态三重校验、超时 `timeoutManager.abort`、事务 + 202 后 resume | ★ manual submit（§3.3）；jobs:resume（§1.4） |
| 7 | **任务中心接入**：`registerTaskStatsProvider('approval', {collectTaskStats})` + afterCreate/Update/Destroy 钩子 + executions.afterUpdate 时把 PENDING 审批置 ABORTED | ★ manual/cc 双例（§3.4/§5）；userWorkflowTaskStats（§1.1） |
| 8 | **审批中心列表 ACL**：`acl.allow('approvalRecords', [...], 'loggedIn')` + listMine 强制 userId 过滤 + appends node/workflow | ★ §3.4/§5 |
| 9 | **审批人变量解析**：assignees/audience 配置经 `processor.getParsedValue`（$context/$jobsMapByNodeKey/$system/$env + $user 等），去重展开；部门/角色解析依赖 plugin-departments（departments m2m users、mainDepartment，`plugin-departments/dist/server/collections/users.js:36-`）与 plugin-users | ▲ §6；departments（§7 之外已确认存在） |
| 10 | **超时自动处理**：`workflow.options.timeout` → `expiresAt`；挂起指令用 `createBackgroundAbortHandle` 保活；到期 ABORTED 或自动通过 | ▲ §1.4 ExecutionTimeoutManager |
| 11 | **客户端 FlowModel 注册**：设计器节点/审批卡片注册到 `flowEngine`（client-v2），配置存 node.config / flowModels.options | ● §7；cc duplicateConfig（§5） |
| 12 | **独立事件去重**：提交时传 `eventKey` 防重复创建 execution | ▲ Dispatcher.js:102-108、386 |

**版本兼容注意**：execution/jobs 读取按"每节点取 MAX(id)"；审批记录必须与 job 一一可回溯（jobId 外键），否则 rerun/overwrite 后状态错乱。`workflows.current` 唯一索引与 `revision` 深拷贝（duplicateConfig）要求审批节点配置中的 uiSchema/flowModel uid 在复制时重建。
