# 04 - workflow-approval 客户端 v2（flow-engine 新一代 UI）逆向分析

> 目的：分析商业插件 `@nocobase/plugin-workflow-approval` 的 **client-v2** bundle（基于 flow-engine 的新一代审批 UI）。
> 素材与行号约定：
> - **主包** = `~/Projects/nocobase-approvals-reverse/analysis/approval-client-v2.beautified.js`（14382 行，已美化），引用格式 `主包:行号`。
> - **chunk** = `~/Projects/nocobase-approvals-reverse/bundles/approval-client-v2-chunks/*.js`（16 个异步分包，压缩）；分析时已美化到 `/tmp/v2chunks/*.js`，**引用行号均为美化后行号**，格式 `chunk 483:行号`（483 为分包号，文件名如 `483.3ada9528d77d3678.js`）。
> - 本文为授权逆向研究，只描述行为与结构，不复 制原始代码。标注【推断】处为合理推测。

---

## 0. 包结构总览

UMD 全局名 `@nocobase/plugin-workflow-approval/client-v2`（主包:11），rspack 打包（chunk script 带 `data-rspack` 标记，主包:13200-13204），publicPath 依据 script src 中 `/static/plugins/@nocobase/plugin-workflow-approval/dist/client-v2/` 推导（主包:13245-13265）。

模块导出面（主包:13279-13300）：

| 导出名 | 含义 |
|---|---|
| `NAMESPACE` | i18n 命名空间 `"@nocobase/plugin-workflow-approval"` |
| `default` / `PluginWorkflowApprovalClientV2` | 插件类 `el` / `ea` |
| `useT` | flow-engine 上下文 t 包装（ns 回退 `[approval, client]`，模块 9488，主包:11140-11174） |
| `tExpr` | flow 模板 `{{t(...)}}` 编译助手（ns 固定 approval，主包:11128-11132） |
| `useApprovalTranslation` | react-i18next `useTranslation([approval, client])`（主包:11134-11138） |

外部依赖（webpack externals 映射，主包:13060-13120）：`3485=@nocobase/client-v2`、`7694=@nocobase/flow-engine`、`197=@nocobase/plugin-workflow/client-v2`、`9341=@nocobase/plugin-notification-manager/client-v2`、`7768=@nocobase/utils/client`、`2059=antd`、`9155=react`、`7375=@ant-design/icons`、`2625=ahooks`、`5477=@emotion/css`、`2625`/`9155` 等。

chunk → 内部模块映射（由 `w.e(...).then(w.bind(w, moduleId))` 推得）：

| chunk | 模块 | 内容 |
|---|---|---|
| 143 | 3562 | ApprovalChildPageModel / ApprovalChildPageTabModel |
| 16 | 9883 | RelatedApprovalsModel（记录详情"相关审批"块） |
| 295 | 5194 | 审批消息模板管理页（notification-manager 设置页签） |
| 344 | 4907 | TriggerChildPageModel / Tab（发起界面页面骨架） |
| 427 | 5294 | ApprovalBlockGridModel（审批块网格 + 添加块菜单） |
| 483 | 1182 | 触发器 ApprovalPresetFieldset / ApprovalTriggerFieldset |
| 502 | 6461 | ApplyTaskCard* 模型（"我的申请"卡片） |
| 51 | 598 | ApprovalInitiationsBlockModel / ApprovalTodosBlockModel |
| 524 | 6967 | ApprovalTaskRouteDetailPageModel（深链详情页） |
| 617 | 9264 | 审批节点 ApprovalPresetFieldset / ApprovalFieldset / ApprovalCanvasComponent |
| 654 | 9181 | ApprovalDetails* 模型（与 502 合载） |
| 733 | 3300 | ApprovalTaskCard* 模型（"我的审批"卡片） |
| 828 | 1695 | PatternForm*/ApplyForm*/ProcessForm*/CommentForm* 全部表单模型与审批动作 |
| 863 | 674 | 旧版（v1）触发器 Fieldset（legacy 迁移用） |
| 931 | （共享） | 共享组件：审批通知配置（9785）、变量/翻译（9488 引用）等 |
| 984 | 9395 | TriggerBlockGridModel（发起界面网格 + 添加块菜单） |

---

## 1. 插件初始化流程

### 1.1 生命周期

插件类 `ea`（主包:14104-14213）继承 `@nocobase/client-v2` 的 `Plugin`：

- **beforeLoad**（主包:14144-14152）：仅注册事件监听 `plugin:notification-manager:loaded` → 回调 `registerNotificationTemplatePage`（等通知管理插件加载后再挂模板页签）。
- **load**（主包:14154-14161）：依序执行 `registerAudienceTypes → registerCollections → registerModelLoaders → registerWorkflowExtensions → registerNotificationTemplatePage`。
- **load 后置包装**（`el`，主包:14214-14361）：首次 load 完成后（用标记 `__nocobase_plugin_commercial_client_v2_registered__` 防重，主包:13285、14316）：
  1. `app.i18n.addResources(locale, "plugin-commercial", ...)` 注入商业授权翻译资源（模块 6313，`_J`=en-US/zh-CN 词表、`CU="plugin-commercial"`，主包:11009-11051）；
  2. `app.addComponents({ KeyInfo, LicenseCard })`（主包:14351-14353）；
  3. `flowEngine.registerModelLoaders({ CommercialTopbarActionModel: { extends: "TopbarActionModel", loader } })`（主包:14354-14360）。该模型（chunk 内模块 5839，主包:7976-8051）sort=400、actionId `"commercial"`、testId `"commercial-license-button"`、aclSnippet `"*"`，仅在 flowSettingsEnabled 时渲染授权按钮。

### 1.2 registerAudienceTypes（主包:14163-14171）

- `this.audienceTypes.register("role", v.b)`：注册名为 `role` 的受众类型定义（模块 1445，主包:8153-8417）：`{ key:"role", label: t("Role"), Component }`。Component 是一个 antd **Transfer** 穿梭框：`roles:list({paginate:false})` 拉取全部角色（主包:8289），显示"Available roles / Selected roles"，支持搜索、分页（pageSize 20），值去重后回调。
- `flowEngine.context.defineProperty("approvalAudienceTypes")`：把受众类型注册表暴露为 flow 上下文属性（主包:14166-14170）。

### 1.3 registerCollections（主包:14173-14177；实现模块 334，主包:12212-12825）

`q.k(flowEngine)` 向 **main 数据源** 补注册 8 个客户端集合定义（已存在则跳过，全部带 `hidden:true`，主包:12791-12825）；并监听 `app.eventBus "dataSource:loaded"`，当 dataSourceKey 为 `main` 或 `*` 时重复注册（主包:14116-14118、14176）。

| 集合 | migrationRules | 关键字段（节选） |
|---|---|---|
| `workflows`（隐藏精简版） | — | id/title/createdBy（主包:12528-12569） |
| `flow_nodes`（隐藏精简版） | — | id/title（主包:12570-12594） |
| `approvals`（"Approval applications"） | schema-only | id(snowflake)、collectionName、dataKey、workflow(m2o)、workflowKey、executions(b2m through approvalExecutions)、rounds(hasMany approvalExecutions)、latestRound(fk latestExecutionId)、records(hasMany approvalRecords)、status(枚举 Wd)、data(json)、applicantRole(belongsTo roles, fk applicantRoleName)、createdBy(Initiator)、action(jsonb)（主包:12595-12733） |
| `approvalRecords`（"Approval todos"） | schema-only | id、approval(m2o)、approvalExecution、user(Assignee)、job、execution、node(flow_nodes)、workflow、index、title(Task title)、status(枚举 ii)、comment、returnToNodeKey、type、prevRecord、dataBefore、dataAfter、changes；索引 `(jobId,index)` 唯一 + `(userId,status)`（主包:12349-12527） |
| `approvalExecutions`（"Approval executions"） | schema-only | id、approval、approvalId、execution、executionId、status、reason(枚举 `{{ExecutionReasonOptions}}`)、snapshot(jsonb)、records（主包:12220-12286） |
| `approvalMsgTpls` | **overwrite** | id、notificationType(渠道类型)、title、type(todo/done)、template(json)（主包:12287-12348） |
| `approvalAudiences` | overwrite+schema-only | id、workflow、type、targetKey；索引 `(workflowId,type,targetKey)`（主包:12736-12762） |
| `approvalAudienceUsers` | schema-only | id、workflow、user；索引 `(workflowId,userId)` 唯一（主包:12764-12788） |

### 1.4 registerModelLoaders（主包:14179-14182；实现模块 9813，主包:11286-12190）

`g.r(flowEngine)`：
- 先 `registerModels({ ApprovalBlocksMenuModel })`（若未注册，主包:11422-11425）；
- 再通过 WeakSet + 实例标记 `__workflowApprovalModelLoadersRegistered__`（主包:11405-11406）一次性注册 **45 个懒加载模型**（完整清单见 §2）。

### 1.5 registerWorkflowExtensions（主包:14184-14188）

向 workflow 客户端 v2（优先 `app.pm.get(PluginWorkflowClientV2)`，回退 `app.pm.get("workflow")`，主包:14186）注册：
- `registerTrigger("approval", H)` —— H 定义见 §3；
- `registerInstruction("approval", N)` —— N 定义见 §4；
- `registerTaskType(y.MW="approval-apply", I.M8)` 与 `registerTaskType(y.d1="approval-todos", I.e4)` —— 见 §6；
- `registerWorkflowNoticeProvider("workflow-approval-legacy-ui", provider)`：`getNotices({surface, workflow})` 当 surface 为 `trigger-node-card` 且 workflow.type==="approval" 且 `config.applyForm` 仍指向旧版 UI 时，返回 key `workflow-approval-legacy-initiator-ui` 的 warning 通知："Initiator interface cannot be used in the current version…Reconfigure it for the current version…"（主包:14190-14205）。

### 1.6 registerNotificationTemplatePage（主包:14119-14134）

向 `notification-manager` 插件设置页追加页签：
- key `templates`，标题 `t("Approval message templates")`，`aclSnippet: "pm.notification.templates"`，sort 2；
- `componentLoader: () => chunk 295 → module 5194`；
- 若 `pluginSettingsManager.has("notification-manager.templates")` 已存在则不再注册，并移除事件监听（幂等）。见 §9。

---

## 2. 常量与枚举（模块 358，主包:12827-13058）

| 导出名 | 值 | 说明 |
|---|---|---|
| `CU` | `"@nocobase/plugin-workflow-approval"` | i18n 命名空间 |
| `J2` | DRAFT:0, RETURNED:1, SUBMITTED:2, PROCESSING:3, APPROVED:4, REJECTED:-1, FAILED:-2, ABORTED:-3 | **approvals.status**（审批单状态） |
| `uy` | ASSIGNED:null, PENDING:0, RETURNED:1, APPROVED:2, UNPROCESSED:3, PASSED:4, DELEGATED:8, REJECTED:-1, CANCELED:-2, WITHDRAWN:-3, ADDED:99 | **approvalRecords.status**（审批任务/记录状态） |
| `su` | REJECTED/RETURNED/APPROVED/DELEGATED/ADDED | 可配置到节点的"动作结果"集合（用于 actions 同步，§7.4） |
| `nS` | Normal / Delegated / Added | 任务类别（分配方式） |
| `Fk` | TODO:"todo", DONE:"done" | 通知消息类型 |
| `es` | CUSTOM:"custom", TEMPLATE:"template" | 消息模板形态 |
| `N4` | [{Template},{Custom}] | 模板形态选项 |
| `Wd`/`Oe` | 8 项状态元数据 | approvals 状态 Tag：Draft(EditOutlined, 可编辑)、Returned(RollbackOutlined, purple, 可编辑)、Submitted(FileAddOutlined, cyan)、Processing(ClockCircleOutlined, gold)、Approved(CheckOutlined, green, terminated)、Rejected(CloseOutlined, red, terminated)、Workflow failed(magenta, terminated)、Aborted(StopOutlined, volcano, terminated)（主包:12940-12988） |
| `ii`/`aN` | 10 项状态元数据 | approvalRecords 状态 Tag：Assigned(blue/Hourglass)、Pending(gold)、Returned(purple)、Approved(green)、Rejected(red)、Canceled、Withdrawn(Undo)、Unprocessed、Delegated(geekblue/Export)、Added(Plus)（主包:12989-13034） |
| `MW` | `"approval-apply"` | 任务类型 1（我的申请） |
| `d1` | `"approval-todos"` | 任务类型 2（我的审批/待办） |
| `yv` | ANY:"any", COUNT:"count", SPECIFIC:"specific", START:"start" | 退回范围类型 |
| `dj` | [{Any previous approval node},{Previous N approval nodes},{Only specific approval node},{Applicant (restart)}] | 退回范围选项（主包:13046-13058） |

图标字符串 → 组件映射表见主包:8997-9006（CheckOutlined 等 12 个）。

---

## 3. Trigger "approval"（H，主包:13784-13926）

继承 workflow 客户端 v2 的 `Trigger`（模块 197）。

**静态属性**：`sync=false`（异步）；title `t("Approval event")`；description 详述"通过动作按钮或 API 发起审批时触发，专属审批节点与审批块"（主包:13793-13798）。

**加载器**（主包:13799-13812）：
- `PresetFieldsetLoader` / `FieldsetLoader` → `Promise.all([chunk 931, chunk 483]).then(module 1182)` → `ApprovalPresetFieldset` / `ApprovalTriggerFieldset`；
- `TriggerFieldsetLoader` → chunk 863（module 674）旧版字段集（仅迁移场景）；
- `useVariables: G`（触发器变量暴露，定义见 chunk 483 内，行为与 v1 变量面一致）。

**触发条件**：
- `isActionTriggerable_deprecated`：动作按钮 action ∈ `["submit","customize:save","customize:update"]` 才可绑定（主包:13803-13805）；
- `actionTriggerableScope`：仅 `"form"` 区块（主包:13806-13808）。

**createDefaultConfig**（主包:13823-13830）：`{ mode: 0, centralized: false, audienceType: 1, recordShowMode: false, useSameTaskTitle: false }`。

**validate**：`!!config.collection`（主包:13831-13834）。

**getCreateModelMenuItem**（主包:13835-13907）：为画布"创建模型菜单"提供两项：
1. `approvalInformation`（"Approval information"）→ `ApprovalDetailsModel`，resourceSettings init `{dataSourceKey:"main", collectionName:"approvals"}`，子网格 `NodeDetailsGridModel(subType:"object")`；
2. 若已配置 `config.collection`：`originalApplicationContent`（"Original application content"）→ `NodeDetailsModel`，`dataPath: "$context.data"`，数据源/集合取自 config.collection。

**useTempAssociationSource**（主包:13910-13917）：`{collection, nodeId, nodeKey:"workflow", nodeType:"workflow"}`——让表单设计器以"临时关联"读写触发数据。

### 3.1 触发器设置面板（chunk 483，module 1182）

- **ApprovalPresetFieldset**（chunk 483:1416-1427）：仅一个必填 `config.collection`（CollectionCascader）——新建工作流时的预设项。
- **ApprovalTriggerFieldset**（chunk 483:1428-1794，函数 `z`）字段全表：

| 表单项 | config 键 | 控件与取值 |
|---|---|---|
| Collection（展示） | — | 只读文本"数据源 / 集合"（`_` 组件，chunk 483:1303-1376）；真实值藏在 hidden input（1419-1426） |
| withdrawable | `config.withdrawable` | **隐藏字段**（1515-1519，V 为 hidden input 1295-1302）。实际由"发起界面设计器"内的开关写入并即时 `workflows:update {filterByTk, values:{config}}` 同步（§3.2） |
| Trigger mode | `config.mode` | Radio：`1`=Before data saved（"审批通过前不入库"）；`0`=After data saved（默认，"先入库再走流程"）（1525-1560） |
| Where to initiate | `config.centralized` | Radio：`false`=Initiate in data blocks only（默认，业务数据场景）；`true`=Initiate in both data blocks and to-do center（行政数据场景）（1561-1598） |
| Who could initiate | `config.audienceType` | 自定义组件 `w`（§3.3），初值 1（1599-1607） |
| Usage instructions | `config.usageInstructions` | centralized=true 时出现：TextArea，占位 "Click to initiate approval"，说明文字显示在待办中心审批列表（1608-1623） |
| Initiator's interface | `config.approvalUid` | flow model uid 选择/设计器（组件 A，uidPrefix `approval_`），extra "For initiating approvals, or viewing and manipulating initiated approvals."（1629-1646） |
| My applications card | `config.taskCardUid` | uid 设计器（uidPrefix `task_card_`），extra "Key information displayed in the My applications list."（1647-1664） |
| Record show mode in the flow | `config.recordShowMode` | Radio：`false`=Snapshot（默认，各方看到进入时的快照，提交后仅本人可见自己改动）；`true`=Latest（始终最新）（1665-1694） |
| Preload associations | `config.appends` | AppendsSelect（workflow 共享组件），提示多级 to-many 性能风险（1695-1706） |
| （迁移警告） | `config.associationShowMode` | 若 appends 非空且 associationShowMode=true，Alert "Association data loading mode is deprecated"，Migrate 按钮直接置 false（1709-1733） |
| Use same task title… | `config.useSameTaskTitle` | Checkbox，勾选后统一任务标题（1734-1748） |
| Task title | `config.taskTitle` | useSameTaskTitle 时出现，变量字符串输入（组件 k.b），初值取节点标题/触发器标题/工作流标题（1750-1760） |
| Auto pass | `config.autoPassIfApprovedInRound` | Checkbox "Auto pass if approver has already approved in current round"（1761-1774） |
| — | `config.autoPassIfApplicant` | Checkbox "Auto pass if approver is applicant"（1775-1787） |
| Done notifications | `config.notifications` | 共享通知配置组件（模块 9785，chunk 931），`type=Fk.DONE`，变量集 `C.N5`（1788-1792） |

### 3.2 发起界面/任务卡设计器（chunk 483 组件 A，931-1290）

- uid 生成 `randomId(prefix)`；对话框用 `flowContext.viewer.dialog`，inputArgs：`{flowContext:{workflow}, isWorkflowFormConfigMode:true, nodeConfig:<trigger config>, onNodeConfigChange}`（974-1035）。
- `onNodeConfigChange`：把（可能含 `withdrawable` 的）config 写回表单 + `workflows:update {filterByTk: workflowId, values:{config}}`，失败回滚表单值（987-1034）——**withdrawable 就是在发起界面设计器里配置的**。
- **v1 → v2 迁移**：监视 `config.applyForm`（旧 UI schema uid）；配置新界面时 `Modal.confirm`（"This action will delete the current legacy interface and cannot be undone."）→ `POST uiSchemas:remove/<uid>` → 清空 `config.applyForm`（1084-1130）。
- 已有执行（`versionStats.executed>0`）时进入只读锁定（966-973）。
- 发起界面默认模型（`N`，chunk 483:1377-1414）：`TriggerChildPageModel`（props displayTitle:false, enableTabs:false, title "Initiator's interface"）+ tabs `[TriggerChildPageTabModel → grid: TriggerBlockGridModel]`。
- 我的申请卡默认模型（`b`，chunk 483:1445-1462）：`ApplyTaskCardDetailsModel(subType:"object")` + grid `ApplyTaskCardGridModel`，resourceSettings `{dataSourceKey:"main", collectionName:"approvals"}`，detailsSettings horizontal 布局，标题取工作流标题。
- 上下文注入（`v`/`O`，chunk 483:1463-1502）：`workflow`、`dataDataSourceKey`、`dataCollectionName`、`collection`（供表单块取集合）。

### 3.3 "Who could initiate"（chunk 483 组件 `w`，232-660）

- Radio：`1`=All users（默认）/ `0`=Only selected users（386-405）。
- 选 0 时：展示各受众类型 Tag + 已选数量 Badge；"Select" 打开 Modal "Who could initiate"（40% 宽），按 `approvalAudienceTypes` 注册表渲染 Tabs（每类一个 Component，缺省回落 `role` Transfer）（406-660）。
- 读取：`approvalAudiences:list {filter:{workflowId}, paginate:false}` → 按 type 分组 targetKey（251-327）。
- 保存：`approvalAudiences:replace {filter:{workflowId}, values:[{type, targetKey, workflowId}...]}`（329-358）。

---

## 4. Instruction "approval"（N，主包:13499-13623）

继承 `Instruction`：title `t("Approval")`、`type:"approval"`、`group:"manual"`、`async:true`、icon AuditOutlined（主包:13511）。

**加载器**（主包:13512-13528）：`PresetFieldsetLoader` / `FieldsetLoader` / `ComponentLoader` 均 → `Promise.all([chunk 931, chunk 617]).then(module 9264)` → `ApprovalPresetFieldset` / `ApprovalFieldset` / `ApprovalCanvasComponent`。

**branching**（主包:13529-13540）：`config.branchMode` 为 true 时产出三支：APPROVED(4) / REJECTED(-1) / RETURNED(1)（`y.uy`）。

**useVariables**（D，主包:13439-13498）：暴露 `nodeTitle`、`title`(Task title)、`status`(Processed status)、`data`(Data approved，子字段=触发集合字段经 getCollectionFieldOptions 编译)、`records`(Approval records：id, userId, status, comment, updatedAt)。

**createDefaultConfig**（主包:13549-13554）：`{ approvalUid: randomId() }` —— 每个审批节点即时分配 Approver's interface 的 uid。

**isAvailable**（主包:13556-13574）：仅允许在 approval 型工作流中使用；且**不得**位于任何上游 approval 节点 RETURNED 分支或 parallel 节点下游（沿 upstream 链检测）。

**getCreateModelMenuItem**（主包:13576-13615）：一项 `data`（"Data approved"）→ `NodeDetailsModel`，`dataPath: "$jobsMapByNodeKey.<nodeKey>.data"`。

### 4.1 节点设置面板（chunk 617，module 9264）

- **ApprovalPresetFieldset**（`eo`，chunk 617:1795-1821）：新建节点时的 Mode 单选：`config.branchMode`：`false`="Passthrough mode"（默认）/ `true`="Branch mode"，必填。
- **ApprovalFieldset**（`el`，chunk 617:1822-2184）字段全表：

| 表单项 | config 键 | 控件与取值 |
|---|---|---|
| （隐藏） | `config.actions` | hidden Input，保存节点启用的动作枚举（1869-1873） |
| Pass mode | `config.branchMode` | Radio **disabled**（创建后不可改）：Passthrough——"When rejected or returned, the workflow will be terminated immediately."；Branch——"Could run different branch based on result."（1874-1907） |
| Assignees | `config.assignees` | 必填校验（数组非空）；组件 `Q`（§4.2）（1908-2054） |
| Negotiation mode | `config.negotiation` | 组件 `Z`（§4.3），初值 0（2055-2063） |
| Order | `config.order` | Radio：`false`="Parallelly"（默认，任意顺序）/ `true`="Sequentially"（顺序会签）（2064-2093） |
| Disable auto pass | `config.forceManualApproval` | 仅当触发器开启了任一 autoPass 时显示；Checkbox "When checked, this node will not auto pass even if auto pass is enabled in approval trigger."（2094-2107） |
| End the workflow after rejection branch | `config.endOnReject` | 仅 branchMode=true 时显示；Checkbox（2108-2124） |
| Approver's interface | `config.approvalUid` | 组件 `M`（uidPrefix `approval_`）；无触发器集合时显示 Alert "Please configure the collection in the trigger first."（2125-2159） |
| My approvals card | `config.taskCardUid` | 组件 `M`（uidPrefix `task_card_`），extra "Key information displayed in the My approvals list." |
| Task title | `config.title` | 变量字符串输入（`ea` 组件），初值节点标题；useSameTaskTitle 时 disabled 并提示"标题沿用触发器"（2160-2177） |
| Todo notifications | `config.notifications` | 共享通知组件，`type=Fk.TODO`，变量集 `I.LY`（2178-2182） |

- **`M`（界面选择器，chunk 617:755-975）**：区分 `approval`（SettingOutlined/primary）与 `taskCard`（CreditCardOutlined）两种；**旧版迁移**：若节点还有 `config.applyDetail`（v1 详情 schema）且未执行过（executed=0），显示"Legacy interface"下拉（disabled）+ "Configure new interface"（Modal.confirm → 删除旧 schema `flow_nodes:update`/`uiSchemas:remove`，见 898-937 的 `flow_nodes:update {filterByTk: node.id, values:{config}}` 与成功提示 "Deleted successfully"）。
- **ApprovalCanvasComponent**：画布节点渲染组件（含 branchMode 分支标签等，module 9264 内，行为为标准 instruction canvas）。

### 4.2 Assignees 选择器（chunk 617）

- **添加入口 `Y`**（1350-1407）：虚线 "Add" 按钮 Popover，两个选项：
  - **Select users** → 追加一个 **字符串占位 `""`**（固定用户组，渲染为 `UsersSelect` 多选，且支持把 workflow 用户型变量混入下拉选项——transformVariableOptions 拼接 `$scopes`/`$jobsMapByNodeKey`/`$context` 变量，chunk 617:1066-1185）；
  - **Query users** → 追加 **`{filter:{}}`**（动态用户查询组）。
  即 assignees = **多组审批人数组**，每组为固定用户集合或过滤条件集合（**没有** v1 常见的"部门/主管"内置模式；动态性由"用户变量 + filter 查询"承担）。
- **行组件 `J`**（1408-1467）：dnd-kit 可拖拽排序（HolderOutlined 手柄、"Sort assignee" aria）、删除按钮（"Remove assignee"）；序列化时数字字符串转回 number（`q`，1274-1276）。

### 4.3 Negotiation（chunk 617 组件 `Z`，1627-1726）

| 单选 | 存储值 | 语义 |
|---|---|---|
| Or | `0`（默认） | 任意一人通过/拒绝即结果 |
| And | `1` | 全部通过才通过，任一拒绝即拒绝 |
| Voting | `0<x<1`（小数，默认 0.5） | 通过率 > N% 即通过；UI 显示 `>` InputNumber(1-99)%，存储为分数 |

---

## 5. flow-engine 模型注册清单

`registerModelLoaders`（主包:11421-12190）注册的 45 个模型（`extends` 父类 → 加载 chunk/模块）：

**审批单详情（chunk 502+654，模块 9181）**
1. `ApprovalDetailsModel` extends `NodeDetailsModel`
2. `ApprovalDetailsGridModel` extends `NodeDetailsGridModel`
3. `ApprovalDetailsItemModel` extends `ApplyTaskCardDetailsItemModel`
4. `ApprovalDetailsAssociationFieldGroupModel` extends `ApplyTaskCardDetailsAssociationFieldGroupModel`

**我的申请卡（chunk 502，模块 6461）**
5. `ApplyTaskCardDetailsModel` extends `DetailsBlockModel` —— 卡片块；注册 `cardSettings` flow（title/description 默认取工作流标题，chunk 502:634-669）
6. `ApplyTaskCardGridModel` extends `DetailsGridModel`（字段项基类限 ApplyTaskCardDetailsItemModel / …AssociationFieldGroupModel / TaskCardCommonItemModel，chunk 502:688-719）
7. `ApplyTaskCardDetailsItemModel` extends `DetailsItemModel`（支持"审批数据虚拟字段"解析 resolveVirtualCollectionField，chunk 502:877-930 附近）
8. `ApplyTaskCardDetailsAssociationFieldGroupModel` extends `DetailsAssociationFieldGroupModel`（"Display association fields"，chunk 502:1106）

**子页面骨架（chunk 143，模块 3562）**
9. `ApprovalChildPageModel` extends `ChildPageModel`（内嵌 ApprovalBlockGridModel，chunk 143:141）
10. `ApprovalChildPageTabModel` extends `ChildPageTabModel`；注册 `ApprovalChildPageSettings.init` flow（setCollectionCtx，chunk 143:388-395）

**审批块网格（chunk 427，模块 5294）**
11. `ApprovalBlockGridModel` extends `BlockGridModel` —— "Add block" 菜单：**Approval blocks → Process form**（ProcessFormModel + PatternFormGridModel），Triggers 变量组、Node result、Data blocks、Other blocks（Markdown / JS block）（chunk 427:75-160、238-292）

**审批中心列表块（chunk 51，模块 598）**
12. `ApprovalInitiationsBlockModel` extends `CollectionBlockModel` —— label "Initiations"，collection `approvals`，resource=MultiRecordResource：refreshAction **`listMine`**、sort `["-createdAt"]`、pageSize 20、appends `["workflow"]`、URL 过滤参数 `workflowApprovalBlockFilter`、nonfilterable 列表（chunk 51:306-343、776-790）
13. `ApprovalTodosBlockModel` extends `CollectionBlockModel` —— label "Todos"，collection `approvalRecords`，appends `["approval","approval.createdBy","node","workflow"]`（chunk 51:797-845）

**深链详情页（chunk 524，模块 6967）**
14. `ApprovalTaskRouteDetailPageModel` extends `FlowModel` —— 按 `inputArgs.collectionName`（approvals→application / approvalRecords→todo）选 `getPopupRecord` 拉取记录（`approvals:get` / `approvalRecords:get`，chunk 524:225-249、374），渲染头部（标题 + 打印，`Ts`=chunk 828 的 ek）与正文（`g$`=eB 或 `W8`=eV），并自定义 view.Header 样式（chunk 524:407-520）

**表单模式模型（chunk 828，模块 1695）** —— 见 §7
15-23. `PatternFormBlockModel`(extends FormBlockModel)、`PatternFormGridModel`、`PatternFormItemModel`、`PatternDetailsItemModel`、`PatternFormFieldModel`、`PatternSubTableColumnModel`、`PatternSubTableFieldModel`、`PatternDisplaySubTableFieldModel`、`PatternFormAssociationFieldGroupModel`
24-28. `ApplyFormModel`(extends PatternFormBlockModel)、`ApplyFormSubmitModel`、`ApplyFormSaveDraftModel`、`ApplyFormWithdrawModel`、`ApplyFormDeleteModel`(均 extends ActionModel)
29-32. `ProcessFormModel`(extends PatternFormBlockModel)、`CommentFormModel`(extends FlowModel)、`CommentFormGridModel`、`CommentFormItemModel`
33-37. `ProcessFormApproveModel` / `ProcessFormRejectModel` / `ProcessFormReturnModel` / `ProcessFormDelegateModel` / `ProcessFormAddAssigneeModel`(均 extends ActionModel)

**我的审批卡（chunk 733，模块 3300）**
38. `ApprovalTaskCardDetailsModel` extends `DetailsBlockModel` —— cardSettings + detailsSettings（refresh / layout）两条 flow（chunk 733:1031-1100）
39. `ApprovalTaskCardGridModel` extends `DetailsGridModel`（字段项基类同上，chunk 733:1101-1146）
40. `ApprovalTaskCardDetailsItemModel` extends `DetailsItemModel`（"Approval task" label，sort 100，chunk 733:1333）
41. `ApprovalTaskCardDetailsAssociationFieldGroupModel` extends `DetailsAssociationFieldGroupModel`

**触发器页面骨架（chunk 344 / 984）**
42. `TriggerChildPageModel` extends `ChildPageModel`（tabs → grid TriggerBlockGridModel，chunk 344:329）
43. `TriggerChildPageTabModel` extends `ChildPageTabModel`
44. `TriggerBlockGridModel` extends `BlockGridModel` —— "Add block" 菜单：**Form → Apply form**（ApplyFormModel + PatternFormGridModel + actions[ApplyFormSubmitModel]）、Other blocks → Markdown…（chunk 984:104-150）

**相关审批（chunk 16，模块 9883）**
45. `RelatedApprovalsModel` extends `DataBlockModel` —— label "Related approvals"；无 `view.inputArgs.filterByTk` 时隐藏；refreshAction **`listRelated`**；flow `relatedApprovalsSettings.steps.dataScope`（use "dataScope"，保存后 setPage(1)+refresh）（chunk 16:1167-1196、936、285）

**菜单模型（非 loader，registerModels）**
- `ApprovalBlocksMenuModel`（模块 6760，主包:11176-11284）：BlockModel，label `t("Approval")`、menuType `submenu`，children：`approval-initiations`（ApprovalInitiationsBlockModel / approvals）与 `approval-todos`（ApprovalTodosBlockModel / approvalRecords）；`createModelOptions` 附带 `detailViewAction: ViewActionModel`，其 popupSettings `openView {mode:"dialog", size:"large", pageModelClass:"ApprovalTaskRouteDetailPageModel"}`（主包:11210-11239）——即列表行点击 → 大对话框 → 路由详情页模型。

**通用"按 uid 渲染模型"渲染器**（chunk 828 内 `x`，主包:8527-8727）：`flowEngine.loadModel({uid, refresh?})`（这就是 `flowModels:findOne?uid=` 端点的消费方），加载前先确保集合与 loader 注册（`q.k`+`g.r`），向上下文注入 `view.inputArgs/close`、`isMobileLayout`、`flowSettingsEnabled`，渲染 `FlowModelRenderer`，卸载时 removeModelWithSubModels。

---

## 6. 两种任务类型（registerTaskType）

定义在模块 3557（主包:8419-10217），对象字段：`{key, title, collection, action, useActionParams, Actions, DetailModal, Item, Detail, getPopupRecord, alwaysShow}`——这是 workflow 客户端 v2 待办中心（`/admin/workflow/tasks/...`）的插件协议。

### 6.1 `y.MW = "approval-apply"`（I.M8 = eQ，主包:10113-10164）——"我的申请"

- title `t("My applications")`；collection **`approvals`**；action **`listMine`**。
- useActionParams（主包:10118-10125）：`filter = merge(tabFilter, {workflowKey?}, urlFilter)`，sort `["-id"]`。
  - tabFilter `et`（主包:9011-9018）：pending → status ∈ [DRAFT, RETURNED, SUBMITTED, PROCESSING]；completed → status ∈ [APPROVED, REJECTED, ABORTED]。
  - URL 过滤参数 key `workflowApprovalApplicationsFilter`（主包:9007）。
- Actions 工具条（主包:10126-10134）：Refresh（eI）、Filter（ej，collection approvals，nonfilterable：workflow.type/sync/description/categories/enabled/title、createdBy）、分页/排序（eL）。
- 列表项 Item → `ez`（主包:9817-9853）：若 `workflow.config.taskCardUid` 存在 → 按 uid 渲染 `ApplyTaskCard*` 模型（reloadKey=`taskKey|record`）；否则回退默认 Card：标题=工作流名，正文 Descriptions（Created at + 状态 Tag）。
- DetailModal（主包:10135-10142）→ `eM`（80vw Modal，标题栏含**打印**按钮，仅当 `workflow.config.approvalUid` 存在显示，主包:9310-9349）。
- Detail → `eB`（主包:9872-9913）：
  1. `workflow.config.approvalUid` 存在且 workflow.nodes 为数组 → `eD` 布局（左：按 approvalUid 加载 ApprovalDetailsModel，inputArgs `{flowContext:{execution|latestRound.execution, nodes, workflow}, approval, refresh}`；右：审批时间线）；移动端变为 Tabs「Approval / Approval process」（`eD`，主包:9355-9428；时间线组件 `m.O`，主包:8052-8090 → 共享模块 7781 `xG`）。
  2. 无 approvalUid 但有旧 `config.applyForm` → `eU`：提示 "Approval interface cannot be displayed on the new page…Return to legacy page"，按钮跳 `/admin/workflow/tasks/approval-apply/pending/<key>`（URL 构造 `eO`，主包:9257-9285）。
  3. 都没有 → Result "The v2 approval interface is not configured."
- getPopupRecord `eG`（主包:10090-10096）：**`approvals:get {…params, except:["data"], appends:Z}`**，appends Z = createdBy, records(+job/node/user), rounds, workflow.title/nodes, latestRound(+execution.jobs)（主包:9009）。

### 6.2 `y.d1 = "approval-todos"`（I.e4 = eJ，主包:10165-10216）——"我的审批（待办）"

- title `t("My approvals")`；collection **`approvalRecords`**；action **`listMine`**。
- useActionParams：tabFilter `ec`（主包:9068-9076）：pending → `{status: PENDING, "approval.status": [SUBMITTED, PROCESSING]}`；completed → status ∈ [APPROVED, REJECTED, RETURNED, UNPROCESSED, PASSED, DELEGATED]；workflow 过滤键为 `"workflow.key"`；URL 参数 key `workflowApprovalTodosFilter`。
- Filter nonfilterable 追加 user、approval.workflow、approval.createdBy.* 等（主包:10184）。
- 列表项 Item → `eK`（主包:9950-10003）：优先 `node.config.taskCardUid` 渲染 `ApprovalTaskCard*`；回退 Card：标题取 record.title/node.title，extra=工作流名，正文 Descriptions（Applicant=approval.createdBy.nickname/username、Assigned at、状态 Tag showIcon）。
- Detail → `eV`（主包:10005-10088）：`node.config.approvalUid` 存在 → `eD` 布局加载审批界面模型，inputArgs 额外含：
  - `approvalRecordData`（任务记录本身）；
  - **`availableUpstreams`**：从 workflow.nodes 按 nodeId/node.key 定位当前节点后**沿 upstreamId 链回溯**的全部上游节点数组（10021-10060）——用于"退回到哪个节点"选项。
  - 旧 `node.config.applyDetail` → 跳转 `/admin/workflow/tasks/approval-todos/pending/<key>`。
- getPopupRecord `eH`（主包:10098-10103）：**`approvalRecords:get {…params, appends:ee}`**，appends ee = approval(+createdBy/records/rounds/latestRound/workflow.nodes)、dataAfter、execution.jobs、job、node、user（主包:9010）。

---

## 7. 审批操作与 API（chunk 828，module 1695）

### 7.0 通用设施

- API 访问器：`eZ(e, t)` = `api.resource("approvals")[t]`（缺失抛 "approvals:<t> is required"，chunk 828:2338-2353）；`eK(e, t)` = `api.resource("approvalRecords")[t]`（2354-2369）。
- 节点配置持久化 `eY`（2846-2870）：`flow_nodes:update {filterByTk: inputArgs.node.id, values:{config}}`。
- 确认弹窗 `ts`（3684-3710）：Modal.confirm，okText "OK"，title 经 `t(…,{ns: approval})`。
- 动作 flow 工厂 `en` 为固定 flow key（"Click settings"），步骤 `confirm → skipRequiredValidation → (assignFieldValues) → saveResource`。

### 7.1 发起/再提交（ApplyFormSubmitModel / ApplyFormSaveDraftModel）

flow 工厂 `e_(status)`（chunk 828:2395-2667），submit→status=SUBMITTED(2)，save draft→DRAFT(0)：

- confirm 步骤（SUBMITTED 时 "Perform the Submit"/"Are you sure you want to perform the Submit action?"；DRAFT 时 Save draft 文案）（2395-2456）。
- `saveResource` handler（2470-2663）：
  - 校验当前 approval.status ∈ {DRAFT, RETURNED}，否则报错 "Only draft or returned approvals can be resubmitted."（2517-2528）；
  - 收集表单值 + `assignFieldValues` 步骤结果合并（`resolveAssignFieldValues`/`mergeAssignFieldValues`，2374-2394、2533-2540）；
  - collectionName 取 `workflow.config.collection` || `approval.collectionName` || `<ds>:<collection>`（2543-2569）；
  - **已有 approval** → `approvals:update {filterByTk: approval.id, updateAssociationValues, values:{collectionName, data, status}}`（2580-2594）；
  - **首次发起** → `approvals:create {updateAssociationValues, values:{collectionName, data, status, workflowId}}`（2597-2617）；
  - 成功 toast "Submitted successfully"，关闭视图（`view.close`），`inputArgs.refresh`。
- `ApplyFormModel`（tS）默认 createModelOptions：pattern `createNew` + grid `PatternFormGridModel` + actions `[ApplyFormSubmitModel]`（5474-5486）。
- `ApplyFormDeleteModel`（tM）：可见条件 approval.status ∈ [DRAFT, RETURNED]（5250-5252）；执行 **`approvals:destroy {filterByTk}`**（5308）；确认文案 "Are you sure you want to delete this approval? This action cannot be undone."；成功 "Deleted successfully"/失败 "Delete failed"。
- `ApplyFormWithdrawModel`（tw）：
  - 可见条件（5085-5101）：记录属于当前用户（`eI` 检查 approval.createdBy）**且** `workflow.config.withdrawable === true` **且** `approval.status === SUBMITTED`；
  - confirm "Are you sure you want to withdraw it?"；
  - 执行 **`approvals:withdraw {filterByTk: approvalId, values?: {data}}`**（5158-5170）；toast "Withdrawn successfully"/"Withdrawn failed"；随后 close+refresh；
  - 动作被移除时会 `destroyModel` 清理持久化并还原 withdrawable 配置（4863-5057 附近，destroyPersistedModel + 恢复 nodeConfig.withdrawable）。

### 7.2 审批人动作（Approve/Reject/Return）——flow 工厂 `td(title, status, mode)`（chunk 828:3871-4386）

- 注册（4665-4755）：
  - `ProcessFormApproveModel.registerFlow(td("Approve", uy.APPROVED, "submit"))`
  - `ProcessFormRejectModel.registerFlow(td("Reject", uy.REJECTED, "submit"))`
  - `ProcessFormReturnModel.registerFlow(td("Return", uy.RETURNED, "return"))`
- `saveResource` 步骤配置：
  - **return 模式**追加 `approvalReturnNodeSettings`（退回范围）uiSchema：`type`（枚举 `y.dj`，无可用上游时只剩 START）+ `target`（SPECIFIC 时选节点）+ `count`（COUNT 时 InputNumber min 1）（3917-4004）；defaultParams 由节点 config `returnTo` 推导（-1→ANY、正数→COUNT、字符串→SPECIFIC、否则 START，3885-3913）。
  - `afterParamsSave`：先持久化评论模型 uid（`ez(e, t.commentModelUid)`→ 保存到模型步骤参数），再 `eY` 写节点配置：`returnToNodeVariable=null`，并按类型映射 `config.returnTo`：ANY→`-1`；COUNT→`Number(count||1)`；SPECIFIC→`target` 且 `returnToNodeVariable = "{{$jobsMapByNodeKey.<target>}}"`；START→`null`（4006-4057）。
- **handler**（4068-4382）运行时行为：
  1. 从 `view.inputArgs` 取 `nodeConfig`/节点信息与 `availableUpstreams`；
  2. **评论表单**：`flowEngine.loadOrCreateModel(randomId)`（缺则 `createModelAsync`），delegate 当前上下文，`flowSettingsEnabled=false`（4095-4160）——即 CommentFormModel；
  3. return 模式计算可退回节点下拉（`e0` 组件）：按 `config.returnTo` 展开——`-1`→全部上游+发起人（label `t("Applicant (restart)")`、value 0）；`N`→最近 N 个上游（不足则加发起人）；字符串→指定节点（4189-4262）；字段名 `returnToNodeKey`；
  4. 弹 Modal（FlowModelRenderer 渲染评论表单 + returnToNodeKey Select）；onOk：
     - 校验评论表单 → `values`（comment、returnToNodeKey）；
     - **`eK(engine, mode)({filterByTk: recordId, updateAssociationValues, appends, values: {…commentValues, status, data: formValues}})`**（4310-4351）：
       - approve/reject → mode=`"submit"` ⇒ **`approvalRecords:submit`**
       - return → mode=`"return"` ⇒ **`approvalRecords:return`**
  5. return 成功后 `to(u)`（刷新相关），resetFields，`tu(u)` 刷新列表；失败 message.error **"Submitted failed"**（4353-4369）。
- 评论模型由 ProcessForm 配置：步骤参数 `saveResource.commentModelUid`（组件 `eX`，uid 选择器；`eH()` 返回 `{commentModelUid: {type:"string", x-component: eX}}`，2820-2826）。

### 7.3 转交 / 加签（Delegate / Add assignee）——flow 工厂 `tf(title, mode, scopeKey)`（chunk 828:4387-4622）

- 注册（4772、4789）：
  - `ProcessFormDelegateModel.registerFlow(tf("Delegate", "delegate", "toDelegate"))`
  - `ProcessFormAddAssigneeModel.registerFlow(tf("Add assignee", "add", "toAdd"))`
- `saveResource`（"Assignees scope" 设置步骤，uiMode 宽 700）：
  - defaultParams 读节点 config 的 `toAddReassignees` / `toDelegateReassignees`（数组，元素为用户 ID 或 `{filter}`）与 `toAddReassigneesOptions` / `toDelegateReassigneesOptions.extraFieldKey`（4407-4442）；
  - 编辑组件 `tn`（3276-3450+）：受托人范围列表（每项 = 用户变量或对 users 集合的 filter，可选字段 id/username/email；支持 Move assignee up/down、删除），另有 **extraFieldKey**（从 users 集合选一个字段，在候选下拉里以 Tag 展示，如部门名）；
  - afterParamsSave：`eY` 写回 `config.toAddReassignees|toDelegateReassignees`（统一规范化为 `{filter}` 形式）与 `…Options {extraFieldKey}`（4453-4520）。
- **运行时 handler**（4522-4618）：
  - Dialog 表单 `tc`（3712-3869）：
    - 候选人加载：**`approvalRecords.reassignees/<recordId>:list {type: "toDelegate"|"toAdd", pageSize: 200, filter?: {nickname|username $includes}}`**（3745-3760，防抖 300ms）——即"可转交给谁"由服务端按配置范围返回；
    - 字段 `assignee`（必填；**add 模式为 multiple**，delegate 为单选）+ `order`（仅 add 且 `config.order===true` 即顺序审批时显示；选项 Before Me(-1)/After Me(1)；negotiation 为 Or(0) 时 order 禁用）（4539-4540、3843-3868）；
  - onOk 提交：**`approvalRecords:<mode> {filterByTk: recordId, values: {assignee, order?}}`**（4577-4590）——mode=`"delegate"` ⇒ `approvalRecords:delegate`；mode=`"add"` ⇒ `approvalRecords:add`。
  - toast "Submitted failed" 失败提示。

### 7.4 ProcessFormModel（tF）——审批表单容器（chunk 828:5487-5803）

- **pattern 决策** `getPattern`（5549-5567）：
  - 有 `approvalRecordData.status`：可操作状态（非终态）→ `"edit"`，否则 `"details"`；
  - 仅 approval.status：经映射表（804-828）——发起人视角 DRAFT/RETURNED→edit，其余→details；审批人视角 DRAFT/PROCESSING/SUBMITTED→edit，其余→details；无记录 → `"createNew"`。
  - `PatternType` 枚举：`createNew | edit | details`（804-809）。
- **表单取值策略** `getFormRecordStrategy`（5586-5633）——实现 Snapshot vs Latest：
  - `recordShowMode`（Latest）为真 → baseValues = `approval.data`（最新单据数据）；
  - 否则（Snapshot）→ baseValues = `approvalExecution.snapshot` ∪ `record.dataBefore` ∪ `record.dataAfter`，并按 dataAfter→dataBefore→snapshot 顺序过滤回退。
- **动作同步** `syncProcessActionToNodeConfig`（5637-5709）：把动作子模型映射为 `su` 枚举（Approve→APPROVED、Reject→REJECTED、Return→RETURNED、Delegate→DELEGATED、Add assignee→ADDED），增删后写 `config.actions` 并 `flow_nodes:update`；监听 `onSubModelAdded/Removed`（5713-5724）。
- 配置态动作菜单（5750-5796）：approve / reject / return / delegate / addAssignee 五个 toggleable 项（AddSubModelButton）+ "Actions" FlowSettingsButton。
- 默认 createModelOptions 来自模块 9738 `U()`（5806-5860）：`ProcessFormModel` + resourceSettings(集合) + pattern createNew + grid PatternFormGridModel。

---

## 8. 审批中心（v2 形态）

v2 **没有独立的"审批中心"插件页面**；它通过 `registerTaskType` 把两个列表挂进 **workflow 客户端 v2 的统一任务中心**（`/admin/workflow/tasks/<taskType>/<pending|done>[/<recordKey>]`）：

- 两个页签：**My applications**（`approval-apply`，approvals:listMine）与 **My approvals**（`approval-todos`，approvalRecords:listMine），均 `alwaysShow: true`（主包:10163、10215）。
- 过滤器：
  - 页签内建 status 过滤（§6.1/§6.2 的 et/ec）；
  - 通用 CollectionFilter 写 URL 查询参数 `workflowApprovalApplicationsFilter` / `workflowApprovalTodosFilter`（主包:9007-9008、`ej` 主包:9522 附近——`JSON.stringify` 进 searchParams）；
  - nonfilterable 字段清单见 §6。
- 行点击 → `useWorkflowTaskRecord().openRecord`（workflow v2 协议）→ DetailModal（80vw）或路由详情；深链 URL `/admin/workflow/tasks/<type>/pending/<taskKey>` 由 `eO` 构造（主包:9257-9285），由 `ApprovalTaskRouteDetailPageModel`（chunk 524）承接。
- 桌面详情为左右布局（表单 60-70% + 时间线 30-40%），移动端（<768px 或 `/mobile/page/workflow-tasks` 路径）改为 Tabs「Approval / Approval process」（主包:8523-8525、9355-9428）。
- **时间线**（"Approval process"）：模块 2062 包装共享模块 7781 的 `xG`——按 workflow.nodes 分组展示 approval.records，每节点显示标题、每人头像/昵称/状态/耗时（dayjs relativeTime，"Duration"）、"Delegated to"、"Assignees added"、comment blockquote、执行原因标签（timeout→"Timed out"、manual_cancel→"Canceled manually"、parent_aborted→"Aborted with parent execution"）（主包:8064-8068、chunk 内 10450+ 区域）。
- **页面内审批块**（数据页面用）：`ApprovalBlocksMenuModel` 菜单（Initiations/Todos，§2/§5）+ 列表块（chunk 51）+ `RelatedApprovalsModel`（业务记录详情里的"相关审批"，approvals:listRelated，chunk 16）。
- **旧版兼容**：`workflow-approval-legacy-ui` 通知 provider（§1.5）；旧 applyForm/applyDetail 记录打开时显示"回旧版页面处理"结果页（主包:9766-9787）。

---

## 9. audience（受众）与通知模板页

### 9.1 approvalAudiences —— **发起资格受众**（非抄送）

- 触发器配置项 `config.audienceType`（"Who could initiate"）：1=All users / 0=Only selected users（§3.3）。
- 存储在 `approvalAudiences {workflowId, type, targetKey}`（type 目前仅 `role`，经 `approvalAudienceTypes` 注册表可扩展），服务端据此在 `approvals` 相关接口做发起资格校验【推断，客户端只见配置与 list/replace】；`approvalAudienceUsers {workflowId, userId}` 为解析后的用户快照表（主包:12736-12788）。
- 客户端 API：`approvalAudiences:list {filter:{workflowId}, paginate:false}`、`approvalAudiences:replace {filter:{workflowId}, values:[…]}`（chunk 483:262、337）。

### 9.2 消息模板（approvalMsgTpls）与通知配置

- **通知开关结构**（存在 trigger/node 的 `config.notifications`）：`Array<{channel, templateType: template|custom, template}>`；类型分 `todo`（给审批人的待办通知）与 `done`（给发起人的结果通知）（模块 8401，主包:11087-11105：label/description "Send notifications to assignees when approval todo is assigned." / "Send notifications to applicant when approval is done."；`pr = "__workflowApprovalHideApplyFormDeleteAction"` 为隐藏删除动作的 inputArgs 标记）。
- **配置控件**（模块 9785，chunk 931:2060-2302）：Form.List 行 = 渠道 Select（**`notificationChannels:list {pageSize:200}`**，disabled）+ templateType Select（template/custom，切换时清空 template）+ template 编辑器（custom 时用 notification-manager 的 ContentConfigForm，channelType + namePrefix ["template"]）。变量集：`LY`/`N5`（todo/done 各自的变量面，chunk 931:2646+，含 `$system.now` "System time"、"$system" 实例 ID 等）。
- **模板管理页**（chunk 295，module 5194）——挂在 notification-manager 设置页（§1.6）：
  - 资源：**`approvalMsgTpls`**（list `{page,pageSize,sort:["-createdAt"]}` / create `{values}` / update / destroy `{filterByTk}`）（chunk 295:278/294/312/361/516/556）；
  - 表单字段：type（Message type：To do[gold] / Done[blue] Tag）、title（Template title）、notificationType（Channel type，选项来自 notification-manager 的 channelTypes registry）、template（ContentConfigForm）；
  - 表格：过滤（CollectionFilter）、刷新、行删除（confirm）、新建；删除失败提示 "Template delete requires record id." 等。

---

## 10. i18n 关键词清单（功能证据）

`t()` 文案（ns=`@nocobase/plugin-workflow-approval`，除非注明 `workflow`/`client`）。按功能分组（均为代码内字面 key，grep 汇总自主包 + 16 chunks）：

- **触发器**：Approval event；Before data saved；After data saved；Data will not be saved until it has been approved.；Data will be saved first, then the approval process will begin.；Initiate in data blocks only；Initiate in both data blocks and to-do center；Usage instructions 相关（"Explain when and how users should initiate…"）；Initiator's interface；My applications card；Snapshot；Latest；Use same task title for all approval nodes；Auto pass / Auto pass if approver has already approved in current round / Auto pass if approver is applicant；Trigger mode；Collection
- **发起资格**：Who could initiate；All users；Only selected users；Available roles；Selected roles；No user selected；Select
- **节点**：Approval；Manual approval operations within the approval process…；Passthrough mode；Branch mode；When rejected or returned, the workflow will be terminated immediately.；Could run different branch based on result.；Assignees；Select users；Query users；No assignees yet, please add one.；Sort assignee；Remove assignee；Move assignee up/down；Negotiation mode；Or / And / Voting；The approval or rejection by anyone of them is the result.；If it's approved by all, it's approved. If it's rejected by anyone, it's rejected.；Approved if the approval rate is greater than the set percentage, otherwise rejected.；Parallelly；Sequentially；Multiple approvers can approve in any order.；Multiple approvers in sequential order.；Disable auto pass；End the workflow after rejection branch；Approver's interface；My approvals card；Task title；Legacy interface；Configure new interface；Delete and configure new interface；Go to configure
- **待办中心**：My applications；My approvals；Click to initiate approval；Initiator；Applicant；Applicant (restart)；Assigned at；Processed status；Task title；Node title；Approval process；Print；Duration；Delegated to；Assignees added；User not found；Workflow is not existed；Initiator interface cannot be used in the current version；Approver interface cannot be used in the current version；Return to legacy page；The v2 approval interface is not configured.；Approval interface cannot be displayed on the new page
- **状态枚举**：Draft/Returned/Submitted/Processing/Approved/Rejected/Workflow failed/Aborted（approvals）；Assigned/Pending/Returned/Approved/Unprocessed/PASSED(未直接展示)/Delegated/Rejected/Canceled/Withdrawn/Unprocessed/Added（approvalRecords）
- **动作**：Approve；Reject；Return；Delegate；Add assignee；Withdraw；Save draft；Delete；Perform the Submit / Perform the Save draft；Are you sure you want to withdraw it?；Are you sure you want to delete this approval? This action cannot be undone.；This operation can not be revocated. Please confirm before submitting.；Submitted successfully / Submitted failed；Withdrawn successfully / Withdrawn failed；Deleted successfully / Delete failed；Only draft or returned approvals can be resubmitted.；Record not found；Form is not available；Comment；Node to return to；Nodes scope allow to return to；Nodes count；Approval node；Any previous approval node；Previous N approval nodes；Only specific approval node；Assignee；Select assignees；Add Order；Before Me；After Me；Assignees scope；Assignees added；Timed out（ns workflow）；Canceled manually；Aborted with parent execution；Execution reason
- **详情/字段变量**：Approval information；Original application content；Data approved；Approval records；Record ID；Assignee ID；Status；Comment；Updated at；Belonged approval；Approve node；Initiator；Task ID；Approval ID；Approval data key；Data approved；Related approvals；Card settings；Details settings；Process form；Apply form；Approval blocks；Other blocks；Markdown；JS block；Add block
- **通知**：Approval message templates；Todo notifications；Done notifications；Send notifications to assignees when approval todo is assigned.；Send notifications to applicant when approval is done.；Notify approver when task starts.；Notify applicant when approval is approved, rejected or returned.；Message type；To do；Done；Channel type；Template title；Template/Custom；Message title/Message content（模板编辑）；Notification channel；Add channel
- **通用（ns client/workflow）**：Refresh、Filter、Search、Page size、{{count}} / page、Select、Confirm、Cancel、Details、Scope variables、Trigger variables、Node result、System time、Instance ID、Created at、Last updated at

---

## 11. API 调用全清单

### 11.1 数据读取

| 端点 | 参数 | 场景 | 位置 |
|---|---|---|---|
| `approvals:listMine` | filter(tab+URL), sort -id | 我的申请列表 | 主包:10117、chunk 51:777 |
| `approvalRecords:listMine` | filter, sort -id | 我的审批列表 | 主包:10169、chunk 51:818 |
| `approvals:get` | except:["data"], appends:Z | 申请弹窗/深链 | 主包:10090-10096 |
| `approvalRecords:get` | appends:ee | 待办弹窗/深链 | 主包:10098-10103 |
| `approvals:listRelated` | filterByTk | 记录详情"相关审批" | chunk 16:936 |
| `approvalRecords.reassignees/<id>:list` | type=toDelegate\|toAdd, pageSize 200, filter(搜索) | 转交/加签候选人 | chunk 828:3745-3760 |
| `roles:list` | paginate:false | 发起资格角色穿梭框 | 主包:8289 |
| `users:list` | paginate:false, sort:[nickname,username] | 加签/转交兜底用户选择 | chunk 828:2940-2950 |
| `notificationChannels:list` | pageSize:200 | 通知渠道选项 | chunk 931:2105 |
| `approvalMsgTpls:list` | page,pageSize,sort -createdAt | 模板管理表 | chunk 295:556 |
| `flowModels:findOne?uid=` | uid（经 `flowEngine.loadModel`） | 全部 flow model 配置加载 | 主包:8667-8673（loadModel 调用点） |
| `workflows:*` / `flow_nodes:*` | — | workflow 客户端 v2 自身协议（画布、列表） | 外部 |

### 11.2 审批动作（写）

| 端点 | 参数 | 动作 | 位置 |
|---|---|---|---|
| `approvals:create` | values:{collectionName, data, status(2\|0), workflowId}, updateAssociationValues | 首次发起/存草稿 | chunk 828:2603-2617 |
| `approvals:update` | filterByTk=approvalId, values:{collectionName, data, status}, updateAssociationValues | 草稿/退回件再提交或存草稿 | chunk 828:2580-2594 |
| `approvals:withdraw` | filterByTk=approvalId, values?:{data} | 撤回（status=SUBMITTED 且 withdrawable 且本人） | chunk 828:5166-5170 |
| `approvals:destroy` | filterByTk | 删除草稿/退回件 | chunk 828:5308 |
| `approvalRecords:submit` | filterByTk=recordId, values:{status(2\|-1), data, comment?, updateAssociationValues, appends} | 同意/拒绝 | chunk 828:4339-4351 |
| `approvalRecords:return` | 同上，status=1, returnToNodeKey | 退回 | chunk 828:4339-4351（mode="return"） |
| `approvalRecords:delegate` | filterByTk, values:{assignee, order?} | 转交 | chunk 828:4577-4590 |
| `approvalRecords:add` | filterByTk, values:{assignee[], order?} | 加签 | chunk 828:4577-4590 |

### 11.3 配置类

| 端点 | 参数 | 场景 | 位置 |
|---|---|---|---|
| `workflows:update` | filterByTk=workflowId, values:{config} | 触发器界面设计器同步（withdrawable 等） | chunk 483:1004-1010 |
| `flow_nodes:update` | filterByTk=nodeId, values:{config} | 节点界面/退回范围/动作集合同步；旧版迁移 | chunk 828:2866-2869、chunk 617:898-900 |
| `approvalAudiences:list` | filter:{workflowId}, paginate:false | 发起资格读取 | chunk 483:262 |
| `approvalAudiences:replace` | filter:{workflowId}, values:[{type,targetKey,workflowId}] | 发起资格整体替换保存 | chunk 483:337 |
| `approvalMsgTpls:create/update/destroy` | 见 §9.2 | 模板 CRUD | chunk 295:278/294/312 |
| `POST uiSchemas:remove/<uid>` | — | v1 UI schema 迁移删除 | chunk 483:1094-1097、chunk 617（迁移同理） |

### 11.4 关键前端状态流（补充）

- 表单 pattern 状态机：`createNew → (approvals:create) → SUBMITTED → edit(PENDING 审批人视角/编辑) → details(终态)`；DRAFT/RETURNED 可重走 `edit → submit`。
- `config.actions`（节点）与 5 个动作模型一一对应（su 枚举），画布中增删动作即时同步到服务端节点配置。
- 快照数据链：`approvalExecution.snapshot`（首览权威快照）∪ `record.dataBefore`（上一轮）∪ `record.dataAfter`（本轮改动）；Latest 模式直接读 `approvals.data`。

---

## 附：与 v1 的关系

- v1 的 `applyForm`（发起界面 schema uid）与 `applyDetail`（详情 schema uid）在 v2 中被 `config.approvalUid` / `config.taskCardUid`（flow model uid）取代；v2 检测到旧值时提供一次性迁移（删除旧 schema + 配置新界面），并对待办中心旧记录显示"回旧版页面"降级（主包:9766-9787、chunk 483:1084-1130、chunk 617:916-950）。
- 任务类型 key（`approval-apply`/`approval-todos`）、状态枚举、`approvals/approvalRecords/approvalAudiences` 资源名与 v1 一致；`approvalRecords.reassignees` 子资源、`approvalRecords:return|delegate|add` 专用端点为 v2 前端实际消费的写接口。
