# 03 · workflow-approval 客户端 v1 Bundle 行为与架构分析

> 授权逆向研究笔记。对象：NocoBase 2.4.0 商业插件 `@nocobase/plugin-workflow-approval` 客户端（schema-based UI，"v1/legacy" 一代，同时内嵌新一代 flow-engine 模型注册入口）。
> 主素材：`analysis/approval-client.beautified.js`（26,009 行，美化后 UMD）。除非另注明，`L####` 均指该文件美化后的行号。
> 其他素材：`bundles/approval-client-chunks/`（14 个异步分包，压缩；分析时已 beautify 到 /tmp/nb-re/）、`bundles/plugin-workflow-client.js`（工作流主包，美化为 `wf-client.js`，行号标注 `wf-client.js:L####`）。
> 状态枚举、tab、模板类型等常量已与任务书给定值交叉验证一致（见 §0.3）。

---

## 0. Bundle 总体结构

### 0.1 文件形态

- UMD 包，注册名 `@nocobase/plugin-workflow-approval`，24 个外部依赖（`@nocobase/plugin-workflow/client`、`client-v2`、`@nocobase/client`、`client-v2`、`@nocobase/plugin-notification-manager/client`、`@nocobase/plugin-mobile/client`、`@nocobase/flow-engine`、antd/formily 全家桶等），见 L10-15。
- rspack 打包（script tag 带 `data-rspack="@nocobase/plugin-workflow-approval:*"`），运行时自动推导 publicPath，支持 `__nocobase_modern_client_prefix__`（v1/v2 共存的多版本路由前缀）与 `__nocobase_public_path__`，L2964-3010。
- webpack 模块表 `k`（L15-2829）只含少量辅助模块；主体代码全部在入口模块（L3037 起）内。14 个异步 chunk 由 `j.u` 映射（L2860-2876）。

### 0.2 导出（L3037-3041）

| 导出名 | 内部变量 | 说明 |
|---|---|---|
| `PluginWorkflowApprovalClient` | `dN` | 插件类本体（§1） |
| `default` | `dU` | `dN.load` 的包装：先执行原 load，再调用 `B.call(this,{app})`（L25875）——这是商业授权外壳，注册 LicenseCard 组件与 `plugin-commercial` i18n 命名空间（L3448-3456、L3042-3060） |
| `registerApprovalClientModels` | `dB`（L25646） | 向 flow-engine 注册约 50 个"新一代"审批模型（ApplyFormModel、ProcessFormApproveModel、ApprovalTaskCardDetailsModel 等，L25647-25688），并把 `relatedApprovalTimelineRenderer` 挂到引擎 context（L25687-25690）。v1 视图里凡是配置了 `approvalUid`/`taskCardUid` 的地方都通过 `er`（flow-engine 视图渲染器，L3800）动态加载这些模型 |

结论：**v1 bundle = v1 schema UI + 新一代 flow-engine 模型的宿主**。v2 UI 的实现细节在 `approval-client-v2.beautified.js` 与 chunks 中，本文以 v1 为主线、chunks 只做角色定位（§11）。

### 0.3 常量与枚举（模块 358，L2438-2667；与已知值一致）

- i18n 命名空间 `CU = "@nocobase/plugin-workflow-approval"`（L2480）。
- `J2` approvals.status：DRAFT=0, RETURNED=1, SUBMITTED=2, PROCESSING=3, APPROVED=4, REJECTED=-1, FAILED=-2, ABORTED=-3（L2481-2491）。
- `uy` approvalRecords.status：ASSIGNED=null, PENDING=0, RETURNED=1, APPROVED=2, UNPROCESSED=3, PASSED=4, DELEGATED=8, REJECTED=-1, CANCELED=-2, WITHDRAWN=-3, ADDED=99（L2492-2504）。注意：标签表 `y`（L2601-2645）**不含 PASSED**（4），PASSED 仅出现在"已办"过滤条件中（§3）。
- `su`：可操作状态映射 {REJECTED, RETURNED, APPROVED, DELEGATED, ADDED}（L2505-2511），用于校验 actions 数组合法性（L11650 附近 `new Set(Object.values(G.su))`）。
- `nS` 记录 type：Normal/Delegated/Added（L2531-2535）。
- `Fk` 中心 tab：todo / done（通知模板的消息类型，L2536-2539）。
- `es` 模板类型：custom / template（L2540-2543）。
- `Wd`/`m`：approvals 状态标签（颜色+图标+editable/terminated 标记，L2544-2586）。editable 仅 DRAFT/RETURNED（用于申请表单只读判定，L7477）；terminated 含 APPROVED/REJECTED/FAILED/ABORTED。
- `ii`/`aN`：approvalRecords 状态标签（L2601-2645）。
- 任务类型 key：`MW = "approval-apply"`、`d1 = "approval-todos"`（L2660-2661）。
- `yv` 退回范围模式：ANY/COUNT/SPECIFIC/START（L2663-2668），标签 `dj`："Any previous approval node / Previous N approval nodes / Only specific approval node / Applicant (restart)"（L2670-2678）。
- JOB_STATUS → approvalRecords.status 映射 `ry`（L8076-8082）：PENDING→0、RESOLVED→2、REJECTED→-1、RETRY_NEEDED→1、CANCELED→-2；EXECUTION_STATUS FAILED/ABORTED → approvals FAILED/ABORTED（L8083-8086）。

---

## 1. 插件注册结构（`dN.load()`，L25741-25872）

`load()` 依次执行：

1. `flowEngine` 上注册工作流部件（L25745）：
   - `registerTrigger("approval", li)` —— 审批触发器（§6.1）；
   - `registerInstruction("approval", aS)` —— 审批节点指令（§6.2）；
   - `registerTaskType("approval-apply", rQ)`、`registerTaskType("approval-todos", rZ)` —— 向工作流插件**任务中心**注册两个任务类型（§2/§3）。
2. `app.addComponents({ ApprovalBlock: r1 })`（L25746）。`r1` 是聚合组件：`Decorator/BlockInitializer/Initiations/Todos/ViewAction/AssigneeViewAction/ApprovalProcess/RecordApprovals/ApprovalDataProvider`（L9077-9420）。
3. `this.audienceTypes.register("role", lw)`（L25748）——"谁可发起"的角色选择器（Transfer 组件，`roles.list`，L15013-15160）。audienceTypes 是 `Registry`（L25713），可被其他插件扩展（如 departments 客户端注册部门类型）。
4. SchemaInitializer 注册：
   - `ApprovalApplyAddActionButton`（aQ，L13218）、`ApprovalApplyAddBlockButton`（aZ，L13272）——申请表单设计器的动作/区块初始化器；
   - `ApprovalProcessAddActionButton`（oX，L10753）、`ApprovalProcessAddBlockButton`（oZ，L10888）——审批处理表单设计器；
   - `addItem("page:addBlock","otherBlocks.approval")` 与 `mobile:addBlock` 同款（L25750-25764）——页面上添加"Approval 区块"（ApprovalBlock.BlockInitializer，选择 Initiations/Todos 两种子块，L9097-9125）；
   - `addItem("popup:common:addBlock","otherBlocks.approvalsBlock")` —— 记录弹窗中添加"Related approvals"（Related approvals）区块（L25765-25770，schema 见 L8420-8500 rR）。
5. SchemaSettings 注册 4 个（L25771-25867）：
   - `actionSettings:workflow:approval:process`：editButton / approvalProcess（oT，"Process settings"）/ skipRequiredValidation / delete；
   - `actionSettings:workflow:approval:apply`：editButton / assignFieldValues / secondConFirm / delete（记录为 SUBMITTED 时禁用删除，L25800-25822）；
   - `actionSettings:workflow:approval:reassign`：editButton / reassign（at，"Assignees scope"）/ delete；
   - `actionSettings:workflow:approval:withdraw`：同 apply。
6. `app.addProvider(r6)`（L25787）：`ExtendCollectionsProvider` 注入 4 个客户端集合定义——`approvals`（模块 2817，L2283）、`approvalRecords`（模块 2154，L2111）、`approvalExecutions`（模块 8529，L1974，含 snapshot/reason/records）、`approvalMsgTpls`（模块 4700，L2045，migrationRules: overwrite）。集合要点见 §3.1。
7. `app.addScopes({ useApprovalViewActionTitle, useApprovalAssigneeViewActionTitle })`（L25788-25789）。
8. `pluginSettingsManager.add("notification-manager.templates", { title: "Approval message templates", Component: ly, aclSnippet: "pm.notification.templates", sort: 2 })`（L25868-25872）——在"通知管理→模板"下加审批消息模板页（§8）。
9. `registerCollectionsToDataSource([4 集合])`（L25872）。
10. load 包装器最后执行 `B.call(this,{app})`（L25875）：注册商业授权的 LicenseCard（L3448-3451）。

---

## 2. 路由与页面

**审批插件自身不注册任何路由**（全文件无 `router.add`）。它的页面全部寄生在两类宿主里：

### 2.1 工作流任务中心（审批中心，由 workflow 插件提供路由）

workflow 插件客户端注册路由（wf-client.js:L16057-16068、L34630-34655）：

- 桌面：`/admin/workflow/tasks/:taskType?/:status?/:popupId?`（routeName `admin.workflow.tasks`）
- 移动：`page/workflow-tasks/:taskType?/:status?/:popupId?`（`mobile.page.workflow.tasks.list`）

审批插件以两个 taskType 挂进来：

| taskType | 标题 | 集合/动作 | 定义 |
|---|---|---|---|
| `approval-apply` | My applications（我的申请） | `approvals.listMine` | rQ，L8743-8900 |
| `approval-todos` | My approvals（我的审批） | `approvalRecords.listMine` | rZ，L8901-9075 |

任务中心页面构成（wf-client.js:L27921-28060）：
- `PageHeader` + `StatusTabs`：桌面用 Tabs，移动用 Segmented，选项 **pending / completed / all**（wf-client.js:L27846-27885；常量 `lV="pending"`, `lU="completed"`，L27843）。
- 列表用 `List.Decorator`（collection=taskType.collection，action=`listMine`，pageSize 20，sort `-createdAt` + 各 taskType 的 `useActionParams(status, workflowKey)` 注入过滤，wf-client.js:L28015-28030）。
- 每条记录渲染 `taskType.Item`（卡片），点卡片 `setRecord` 并导航到 `./{id}`（popupId 段），渲染 `taskType.Detail`（弹层，桌面 modal large / 移动 drawer，wf-client.js:L27939-27965）。
- popup 记录获取：优先 `taskType.getPopupRecord`（审批：`approvals.get({filterByTk, except:['data'], appends:['workflow.title']})`，L8894），否则 `resource(collection).get`（wf-client.js:L27987-27995）。
- `Actions`（每类型自定义操作条）：My applications 有 Refresh / Filter / **Apply new**（ApplyButton）；My approvals 有 Refresh / Filter（L8770-8795、L8920-8955）。

**侧栏 workflow 分组逻辑**（workflow 插件实现，审批只是数据提供方）：
- 数据源：`userWorkflowTaskStats.listMine({ type: <taskType>, page, pageSize: 200, search })`（wf-client.js:L27836、L31325-31345）。响应 rows 形如 `{workflowKey, title, stats}`，stats 按 status 计数（含 `all`）。
- taskType 标签显隐：`taskTypes.get(key).alwaysShow === true`（审批两个类型都 `alwaysShow: !0`，L8900/9075）或 `counts[type].all > 0`（wf-client.js:L27902-27912）。
- 选中某个 workflow 后，`useActionParams(status, workflowKey)` 把 `{workflowKey}` / `{"workflow.key": …}` ` $and` 进过滤（L8751-8757、L8910-8916）。
- 实时刷新：订阅 websocket `ws:message:workflow:tasks:updated`（wf-client.js:L31410-31425）。

### 2.2 普通页面区块（schema UI 路由存在 `uiSchemas`/DB 中）

- 页面添加 "Approval" 区块 → `ApprovalBlock.Decorator`（`List.Decorator`，collection/action=listMine/params 透传，L9077-9095）+ `ApprovalBlock.Initiations|Todos`（只读 SchemaComponent，schema `z`（Initiations，L3474-3590）/ `W`（Todos，L3592-3700））。
- `z`/`W` 结构：ActionBar（Filter 默认条件 + Refresh；Initiations 另有 Apply new 按钮）+ List（Item = FormLayout + Descriptions 卡 `ApplicationItemDetailWithTitle|TodoItemDetailWithTitle` + ActionBar 放 `ApprovalBlock.ViewAction|AssigneeViewAction` 链接）。
- 记录弹窗 "Related approvals"（rR，L8420-8500）：List 区块，行内只读字段（ID/Workflow/Current status/Initiator/Created at）+ `ApprovalBlock.ApprovalProcess`（actionEnabled: true，完整审批过程表）。

### 2.3 打印

详情弹层均带 `PrintAction t_`（L5265-5340）：懒加载 chunk 114 的 react-to-print，包裹 `ContentWrapper`（`#approval-application-{id}` / `#approval-todo-{id}`），print CSS 隐藏 ActionBar、展开全部行（L5285-5320）。

---

## 3. 审批中心 UI

### 3.1 数据模型（客户端集合定义）

- `approvals`（L2283-2436）：id, collectionName, dataKey, workflow(m2o), workflowKey, executions(belongsToMany via approvalExecutions), rounds(hasMany approvalExecutions), latestRound, records(hasMany approvalRecords), status(enum=Wd), data(json), applicantRole, createdBy(Initiator), action(jsonb)。createdBy/updatedBy/createdAt/updatedAt 齐全，simplePaginate。
- `approvalRecords`（L2111-2282）：id, approval(m2o), approvalExecution, user(Assignee), job, execution, node(→flow_nodes), workflow, index, title(任务标题), status(enum=ii), comment(textarea), returnToNodeKey, type, prevRecord, dataBefore/dataAfter/changes(json)。唯一索引 `(jobId,index)`、`(userId,status)`。
- `approvalExecutions`（L1974-2044）：approval/execution 外键、status、reason（enum `{{ExecutionReasonOptions}}`）、snapshot(jsonb)、records。即"一轮"（round）。

### 3.2 My applications（`approvals.listMine`）

- Tab 过滤 `rz`（L8606-8613）：
  - pending: `status ∈ [DRAFT, RETURNED, SUBMITTED, PROCESSING]`
  - completed: `status ∈ [APPROVED, REJECTED, ABORTED]`（FAILED 不进"已办"）
  - all: 无附加过滤
- 默认卡片 `rq`（L8626-8660）：Descriptions 两行——Created at、Status（CollectionField read-pretty，走集合枚举渲染 Tag/图标）。
- 自定义卡片：`workflow.config.taskCardUid` 存在时用 flow-engine 视图 `er` 渲染（`reloadKey: id:updatedAt`，并为模型注入 getCurrentRecord/workflow/dataDataSourceKey/dataCollectionName context，L8797-8830）。
- Actions：Refresh / Filter（nonfilterable 掉 workflow.type/sync/description/categories/enabled/title、createdBy，L8783-8786）/ **Apply new**（§5）。
- 详情入口 `ra`（L7970-8002）：`Action.Link` modal large，内容 `rt`（§4.2）。

### 3.3 My approvals（`approvalRecords.listMine`）

- Tab 过滤 `r$`（L8664-8670）：
  - pending: `{status: PENDING, "approval.status": [SUBMITTED, PROCESSING]}`
  - completed: `status ∈ [APPROVED, REJECTED, RETURNED, UNPROCESSED, PASSED, DELEGATED]`
  - all: 无
- 默认卡片 `rH`（L8672-8698）：Applicant（`approval.createdBy`）、Assigned at（createdAt）、Status。
- 自定义卡片：**取 `node.config.taskCardUid`（审批节点上配置的"My approvals card"）**，而非 workflow 级（L8962-9000）。
- 详情入口 `nN`（L7191-7230）：`approvalRecords-view` Action.Link → `AssigneeViewActionContent nF`（§4.2）。

### 3.4 时间线 / 过程渲染（两端共用）

- `r1.ApprovalProcess`（L9179-9336）：把 `approval.rounds`（按 id 排序）与 `approval.records`（按 jobId、index 排序）合并：
  - 每轮首行注入一条"Apply（申请人提交）"记录（user=createdBy，status=round.status ? SUBMITTED : approval.status，L9195-9210）；
  - 同 jobId 的记录合并为组（rowSpan），统计 statusCount（APPROVED/REJECTED/DELEGATED 计数，L9235-9255）；
  - Delegated 记录回链 `type=Delegated && prevRecordId` 的后续记录显示"Delegated to"；Added 记录挂到 `prevRecordId` 指向的记录显示"Assignees added"（L9256-9266）;
  - 若当前用户是申请人且某轮 status=CANCELED 且只有 1 条记录，补一条 WITHDRAWN 记录（撤回痕迹，L9320-9330）。
  - 表格列：Task node（含会签模式 Tag 与进度圈 Progress，negotiation>0&&<1 显示百分比进度，L8139-8180）、Status、User、Details（时间 + 申请人本人可再点 View，L8183-8215）。
- `ApprovalTimeline rk`（L8231-8285）：包装 workflow 插件的通用时间线组件（模块 7781 的 `xG`），source=approval（nodes 取 flowContext 补全），`renderActionCard rE`（L8192-8210）给每条记录套上 view / assignee-view 弹层 schema（按 kind=application/assignee 分别用 `ra`/`nN`）。

---

## 4. 任务卡详情与处理操作

### 4.1 两个详情容器

- 申请人视图 `rt`（L7837-7936）：外层 `re` Provider（`useRequest approvals.get {filterByTk}`，提供 FlowContext{workflow, nodes, execution=latestRound.execution} + approval + latestRound，L7724-7835）→ 布局：移动端 Tabs（"Approval"/"Approval process"）；桌面左列 60-64% 放申请内容 `n7`，右列放时间线 `rk`（`actionEnabled && !showTimeline` 时隐藏时间线，L7876-7930）。
- 审批人视图 `nF`（L7022-7160）：同构，左侧 `nM`，右侧 `rk`。

`n7`（申请人内容，L7786-7820）：
- `workflow.config.approvalUid` 存在 → 走新一代视图 `n9`（createViewScopedEngine + FlowViewContext + `er`，inputArgs={flowContext:{workflow}, approval, refresh, close}，L7690-7784）；
- 否则 → `RemoteSchemaComponent uid=workflow.config.applyForm`（v1 申请表单 schema），注入组件 `FormBlockProvider t8 / ActionBarProvider n3 / ApplyActionStatusProvider n6 / WithdrawActionProvider n8 / DetailsBlockProvider`，scope `useSubmit=n1、useFormBlockProps=n0、useWithdrawAction=n2、useDestroyAction=n4`。

`nM`（审批人内容，L6995-7020）：
- `node.config.approvalUid` → 新一代视图 `nR`（inputArgs 额外含 availableUpstreams/trigger/approvalRecordData/refresh，L6980-6994）；
- 否则 → `RemoteSchemaComponent uid=node.config.applyDetail`（v1 处理表单），组件 `ProcessModal nw / DelegateModal nO / AddAssigneeModal nx / ApprovalProcessAction nb / ApprovalFormBlockProvider nA / ApprovalActionProvider nP / ApprovalModifiableFieldset t3 / ValueBlock`，scope `useApprovalDetailBlockProps=nm、useApprovalFormBlockProps=nv、useDelegateSubmit=nd、useAddSubmit=np、useRecordId=ns`。

快照逻辑：`nm`（L6325-6335）把 `approvalExecution.snapshot` 灌进表单（配合 trigger 的 recordShowMode=Snapshot）；`recordShowMode=Latest(true)` 时（`associationShowMode`/`recordShowMode` 分支，L6847-6880）改走 `resource(collection)` 拉最新记录（L6878-6880）。

### 4.2 处理按钮（同意 / 拒绝 / 退回 / 委派 / 加签）

按钮不是硬编码，而是**在"审批人界面"schema 里作为区块设计**，由初始化器 `ApprovalProcessAddActionButton`（oX，L10753-10788）提供 5 种：

| 按钮 | x-action（=目标状态） | 组件 | 说明 |
|---|---|---|---|
| Approve | `2`（APPROVED） | oH（InitializerWithSwitch） | primary + htmlType submit |
| Reject | `-1`（REJECTED） | oH | danger |
| Return | `1`（RETURNED） | oH | 打开的 ProcessModal 会追加"退回节点"选择 |
| Delegate | `8`（DELEGATED） | oY（L10713-10750） | modal 挂 `DelegateModal` |
| Add assignee | `99`（ADDED） | oY | modal 挂 `AddAssigneeModal`；schema 里预置 `x-action-settings.approvalReassign={assignees:[]}` |

运行时机制：
- `ApprovalProcessAction nb`（L6357-6421）：点击时若未配置 skipValidator 则 `form.submit()` 校验，然后打开 ActionContext 弹层（即 ProcessModal）。`x-decorator-props.status` 决定该按钮代表哪个目标状态。
- `ApprovalActionProvider nP`（L6793-6810）：记录未处理（`!record.status`，即 PENDING=0/ASSIGNED=null）时显示所有按钮；已处理时只显示与记录状态相同的那个（用于只读展示）。
- `ActionBarProvider nC`（L6850-6875）：处理前若本记录已有加签记录（type=Added && prevRecordId=自己），在按钮上方显示"Added assignees"。

**ProcessModal（nw，L6422-6500）**：
- FormBlockProvider(resource=approvalRecords) + RemoteSchemaComponent(uid=`x-action-settings.approvalProcessSettings`，即该按钮内嵌的表单 schema) + footer Cancel/Submit(`useSubmit=nf`)。
- 当按钮 status=RETURNED 且存在可退回节点时，追加必填 `returnToNodeKey` 下拉（L6464-6480）。候选由 `nh`（L6396-6420）按**审批节点配置 `config.returnTo`** 计算：
  - `returnTo === -1` → 所有上游审批节点 + "Applicant (restart)"（value=0）；
  - `typeof number` → 前 N 个；`typeof string` → 指定 nodeKey 的那一个；
  - 未配置 → 空（不显示下拉）。

**提交动作 `nf`（L6285-6340）**：
- 收集表单值（`useCollectValuesToSubmit` + 本地变量 toJS），`tH` 解析关联字段得到 `data` 与 `updateAssociationValues`；
- 目标动作 = `status === RETURNED ? "return" : "submit"`（L6300）；
- 调用（L6300-6310）：
  - `approvalRecords.submit({ updateAssociationValues, filterByTk: record.id, values: { ...form.values, status, data: parse(data) } })`
  - 或 `approvalRecords.return({ 同上 })`（form.values 中可含 comment；return 时 values 里带 `returnToNodeKey`）。
- 成功后 reset、关闭弹层、刷新列表与时间线。

**DelegateModal（nO，L6502-6588）**：
- 单选 `Assignee`：`RemoteSelect` service=`{ resource: "approvalRecords.reassignees", resourceOf: "{{useRecordId()}}", params: { type: "toDelegate" } }`（L6535-6543），fieldNames nickname/id，option 可附 `extraFieldKey` 字段 Tag（来自节点配置 `toDelegateReassigneesOptions.extraFieldKey`）。
- 提交 `useDelegateSubmit nd`（L6223-6284）：`approvalRecords.delegate({ filterByTk: record.id, values: { assignee } })`（L6242）。

**AddAssigneeModal（nx，L6589-6700）**：
- 多选 `Assignee`：`approvalRecords.reassignees` resourceOf 记录 id，`params: { type: "toAdd" }`（L6628-6636）；
- `order` 单选 **Before Me(-1) / After Me(1)**，默认 -1；`x-reactions: useNodeOrder` —— 仅当 `node.config.order`（顺序签署）时可见，且 **`!node.config.negotiation` 时禁用**（L6596-6605）；
- 提交 `useAddSubmit np`（L6182-6222）：`approvalRecords.add({ filterByTk: record.id, values: { assignee: [...], order } })`（L6201-6208）。

**v1 schema 设置面板中的 reassign 配置（at，"Assignees scope"，L11591-11665）**：写入按钮 `x-action-settings.approvalReassign = { assignees: [...users/variables], extraFieldKey }`；extraFieldKey 候选为 users 表的 id/username/email，用于在 reassignees 搜索结果里附加显示。

**新一代（flow-engine）路径的同名实现**（v1 视图配置了 approvalUid/taskCardUid 时生效）：`approvalRecords.reassignees.list(um("toAdd"|"toDelegate", filter))`（L20379、L21289；`um` 构造 `{type, pageSize:200, filter?}`，L20089-20110）；提交 `approvalRecords.add({filterByTk, values:{assignee, order?}})`（L20560）、`approvalRecords.delegate`（L21482）、`approvalRecords.submit({filterByTk, updateAssociationValues, appends, values:{..., status: APPROVED}})`（L20883/L21776）、`approvalRecords.return({filterByTk, updateAssociationValues, appends, values:{...commentValues, status: RETURNED, data, returnToNodeKey?}})`（L22315）。

### 4.3 撤回 / 删除（申请侧，v1）

- `WithdrawActionProvider n8`（L7681-7689）：当前用户=createdBy 且 `workflow.config.withdrawable===true` 且 `status===SUBMITTED` 才渲染子按钮（withdraw 按钮由申请表单 schema 提供，见 §5）。
- `useWithdrawAction n2`（L7547-7622）：`approvals.withdraw({ filterByTk: approval.id, values?: { data: <assignedValues 变量解析结果> } })`（L7606）。
- `ActionBarProvider n3`（L7653-7662）：仅创建者且 status ∈ [DRAFT, RETURNED, SUBMITTED] 显示操作条。
- `ApplyActionStatusProvider n6`（L7664-7679）：创建者且 status ∈ [DRAFT, RETURNED] 时向子按钮提供上下文状态（Submit→SUBMITTED / Save draft→DRAFT）。
- 删除草稿 `useDestroyAction n4`（L7624-7651）：`approvals.destroy({ filterByTk })`。

---

## 5. 申请表单（Apply / Withdraw）

### 5.1 入口按钮 ApplyButton（ek，L4360-4560）

- "Apply new"按钮 → Drawer 列出可发起的流程：`List.Decorator(collection="workflows", action="listApprovalFlows", params:{ filter: { "config.centralized": true }, pageSize: 20, sort: ["-createdAt"] })`（L4455-4465）。`listApprovalFlows` 是服务端在 workflows 资源上提供的自定义 action（同时被新一代 chunk-756 使用，chunk-756:L1218）。
- 每项渲染 `ApprovalWorkflowCard eE`（L4306-4358）：标题 + `config.usageInstructions`（缺省 "Click to initiate approval"）。
- 点击行为 `useApplyAction eP`（L4263-4305）：
  - 若 `workflow.config.approvalUid` → flow-engine viewer dialog 直接渲染新一代界面；
  - 否则 `setWorkflow(e)` 打开 modal（large），schema 动态生成：`FlowContextProvider{workflow}` + `RemoteSchemaComponent uid=workflow.config.applyForm`，注入 `ApplyActionStatusProvider eg`（无状态包装）、`ActionBarProvider ew`（透传）、`WithdrawActionProvider eO`（**null，首次申请无撤回**），scope `useSubmit=ex`。

### 5.2 提交 `ex`（L4184-4247）

- `form.submit()` 后收集 `x-action-settings.assignedValues`（支持 workflow 变量，`useVariables.parseVariable` + `transformVariableValue` 按目标集合字段转换）；
- 调用 `approvals.create({ values: { collectionName, data: {...form.values, ...assignedValues}, status, workflowId }, updateAssociationValues })`（L4237）。`status` 来自 ApplyActionStatusProvider（弹层里 eg 默认 SUBMITTED；草稿场景由 v1 配置器的 Save draft 提供 DRAFT）。

### 5.3 已有申请的再提交 / 存草稿（v1 详情内）

- `useSubmit n1`（L7486-7545）：`approvals.update({ filterByTk: approval.id, updateAssociationValues, values: { collectionName: workflow.config.collection, data: {...form.values, ...assignedValues}, status } })`（L7538）。
- 表单可编辑性 `n0`（L7470-7484）：仅当 `status.editable`（DRAFT/RETURNED）且 `latestExecutionId === latestRound.id` 且当前用户是创建者 → editable，否则 readPretty。
- 新一代对应实现（chunk 内模型）：submit → `approvals.update|create` status=SUBMITTED（L16506/L16519），save draft → status=DRAFT（L19271/L19284），两者都先校验 `Only draft or returned approvals can be resubmitted.`。

### 5.4 withdrawable 的来源（重要设计）

触发器配置页里**没有** withdrawable 字段——它由申请表单 schema 派生：`le`（L13786-13820）监听设计器 onChange，扫描 schema 中 `x-decorator === "WithdrawActionProvider"` 的区块，有则 `withdrawable=true` 写回 trigger config（保存提示 `a6`："Withdrawable changes unsaved, click Submit to save."，L13440-13464）。新一代路径在保存节点配置时同样回写 `nodeConfig.withdrawable`（L19498-19525）。

---

## 6. 配置 UI

### 6.1 审批触发器（li，L14039-14470）

- `title: Approval event`；`sync=false`；描述明确"通过动作按钮或 API 发起审批时触发"。
- **TriggerFieldsetLoader**（L14060-14064）：懒加载 chunk 863 的 `ApprovalTriggerExecuteConfig`（触发数据/申请人执行配置，见下）。
- `presetFieldset`（新建时）：`collection`（DataSourceCollectionCascader，仅 main 或 DB 实例数据源）。
- `fieldset`（workflow.config）逐字段：

| 字段 | 控件 | 取值 / 含义 | 行号 |
|---|---|---|---|
| collection | DataSourceCollectionCascader（disabled） | 建后不可改 | L14083 |
| mode | RadioWithTooltip | `1` Before data saved（审批通过才落库）；`0` After data saved（默认，先落库再走流程） | L14095-14113 |
| centralized | RadioWithTooltip（垂直） | `false`（默认）Initiate in data blocks only；`true` Initiate in both data blocks and to-do center（是否进审批中心 + Apply new 列表） | L14114-14133 |
| audienceType | ApprovalAudienceSelect（aB，L12924） | `1` All users（默认）；`0` Only selected users → 打开"Who could initiate"弹窗：`approvalAudiences.list {filter:{workflowId}, paginate:false}`（L12818）载入，按 audienceTypes 分 Tab（当前内置 `role`），提交 `approvalAudiences.replace({ filter:{workflowId}, values:[{workflowId, type, targetKey…}] })`（L12678） | L14134-14139 |
| usageInstructions | TextArea | 发起说明，仅 centralized 时可见 | L14140-14158 |
| applyForm（v1） | SchemaConfig（hidden） | 申请人界面 v1 schema uid | L14159 |
| approvalUid（v2） | InitiatorsInterfaceConfig（a8，L13465） | 新一代界面；与 v1 互斥：切 v2 时若存在 applyForm，弹确认 "Before using the v2 UI, you must delete the existing v1 UI…"，删除走 `uiSchemas:remove/{uid}` + `updateNodeConfig`（L13540-13560） | L14160-14177 |
| taskCardUid（v2） | ApplyTaskCardConfigButton（a7，L13748） | "My applications card"：viewer 打开 `ApplyTaskCardDetailsModel`（loadOrCreateModel，L13638-13745） | L14178-14194 |
| recordShowMode | RadioWithTooltip | `false`（默认）Snapshot：各人看到进入时快照，自己提交后仅自己可见改动；`true` Latest：始终看最新记录 | L14195-14216 |
| appends | AppendsTreeSelect | 预载关联（workflow ns 通用字段） | L14217-14231 |
| associationShowMode | hidden boolean + LegacyNotice | 旧版"每次实时加载关联"迁移提示（lo，L14026-14037） | L14232-14248 |
| useSameTaskTitle | Checkbox（默认 false） | 所有审批节点共用同一任务标题；否则用各节点 title | L14250-14260 |
| taskTitle | ApprovalTaskTitleVariableTextArea | 全局任务标题（变量模板），仅 useSameTaskTitle 时可见；空值时回填 workflow.title（la，L13998-14010） | L14261-14273 |
| autoPassIfApprovedInRound | Checkbox（默认 false） | 本轮已同意过的审批人自动通过 | L14274-14281 |
| autoPassIfApplicant | Checkbox（默认 false） | 审批人是申请人时自动通过 | L14282-14288 |
| notifications | NotificationFieldset（type=**done**，L14289-14296） | 办结通知（发给申请人），见 §8 |  |

- **triggerFieldset**（每次执行的参数，L14297-14345）：`data`（TriggerCollectionRecordSelect，触发记录或主键）、`applicantId`（WorkflowVariableWrapper + RemoteSelect users，变量过滤 target=users）、`applicantRoleName`（同法，target=roles）。
- `useVariables ln`（L13942-13968）：暴露 `data.*`（触发集合字段，含 data.appends）与 `applicant.*`（users 字段）+ `approvalId`。
- `useInitializers ll`（L14002-14011）：处理画布的"原始申请内容"区块初始化器（dataPath `$context.data`）。
- `isActionTriggerable_deprecated`：`["submit","customize:save","customize:update"].includes(buttonAction)`；`actionTriggerableScope`：非全局且 block=form（L14360-14368）——数据块按钮绑定审批。
- 画布节点详情菜单 `getCreateModelMenuItem`（L14370-14430）：可添加 "Approval information"（ApprovalDetailsModel）与 "Original application content"（NodeDetailsModel，读 `$context.data`）。
- **withdrawable 不在 trigger fieldset 中**（§5.4，由申请表单 schema 派生）。

### 6.2 审批节点（指令 aS，L12156-12420）

`title: Approval`，group=manual，async=true。

`fieldset`（node.config）逐字段：

| 字段 | 控件 | 取值 / 含义 | 行号 |
|---|---|---|---|
| branchMode | Radio.Group（**disabled**，编辑态不可改） | `false`（默认）Passthrough mode：拒绝/退回即终止流程；`true` Branch mode：按结果走不同分支 | L12184-12218 |
| assignees | ArrayItems + AssigneesSelect（r9）/ AssigneesAddition（r7=workflow UsersAddition） | 审批人数组，必填。`AssigneesSelect r9` 包装 workflow 的 `UsersSelect`：**每一项既可选具体用户，也可选变量**（CurrentUser、申请人、表单用户字段、角色/部门等由 workflow UsersSelect 及扩展插件提供——本包只内置用户与变量；"role" 类型的选择器只用于触发器的 audienceType，不是 assignees 模式） | L12219-12251 |
| negotiation | Negotiation（oh，L9894-9950） | `number`：`0` Or（或签，任一同意/拒绝即结果，默认）；`1` And（会签，全部同意才通过、任一拒绝即拒绝）；`(0,1)` 小数 Voting（投票，同意率 > N%，1-99，InputNumber 默认 50） | L12252-12257 |
| order | RadioWithTooltip | `false` Parallelly（默认，任意顺序）；`true` Sequentially（按 assignees 数组顺序签署） | L12258-12270 |
| forceManualApproval | Checkbox | Disable auto pass：本节点不参与触发器的 auto pass | L12271-12278 |
| endOnReject | Checkbox | 拒绝分支结束后终止整个 workflow（仅 branchMode 时显示） | L12279-12289 |
| applyDetail（v1） | SchemaConfigButton（o8→o6） | 审批人界面 v1（设计抽屉） | L12290-12308 |
| approvalUid（v2） | ApproversInterfaceConfig（o9，L11352） | 新一代界面（与 v1 互斥逻辑同触发器；删除 v1 走 `uiSchemas:remove/{applyDetail}` + `updateNodeConfig`，L11440-11470） | L12309-12322 |
| taskCardUid（v2） | ApprovalTaskCardConfigButton（ax，L12110） | "My approvals card"：`ApprovalTaskCardDetailsModel` viewer | L12323-12337 |
| noCollectionWarning | Alert | 触发器未配置集合时的警告 | L12338-12352 |
| title | WorkflowVariableTextArea | 本节点任务标题（默认 `{{useNodeContext().title}}`）；useSameTaskTitle 时显示 "The title set in approval trigger will be used as the task title."（reaction ag） | L12353-12364 |
| notifications | NotificationFieldset（无 type → 默认 **todo**） | 待办通知（发给审批人），见 §8 | L12365-12371 |

- `presetFieldset.branchMode`：新建节点时 branchMode 可选（Passthrough/Branch），L12372-12388。
- `branching`（L12389-12400）：branchMode=true 时产出三个分支：Approved(2) / Rejected(-1) / Returned(1)。
- `scope`：useConsistentTaskTitleReaction（ag）、useAutoPassOverrideReaction（aw）、useNotificationVariables（ab，节点上下文变量）。
- **退回范围配置不在 fieldset 里**，而在 Return 按钮的设置弹窗（oT，"Process settings"，L10237-10330）：`approvalReturnNodeSettings = { type: ANY|COUNT|SPECIFIC|START(默认), target?: nodeKey, count?: n }`（oA schema，L10131-10180；候选 `oj`：有上游审批节点时给全部 4 项，否则只有 START）。设计器 onChange 把它换算成 `returnTo`（-1 / number / nodeKey / null）与 `returnToNodeVariable = "{{$jobsMapByNodeKey.<key>}}"`（L11094-11115）。
- **actions 数组的含义**：审批人界面设计器（v1 applyDetail）onChange（g，L11066-11119）扫描所有 `ApprovalFormBlockProvider` 区块内的动作按钮，把 `x-action`（状态数字）收集为 `node.config.actions`（Set→数组）；因此 `actions` = 该节点处理界面上可用的操作状态集合（[2]/[-1]/[1]/[8]/[99] 的组合），服务端据此与 UI 能力对应；同时提取 Delegate/Add assignee 按钮的 `approvalReassign` → `toDelegateReassignees(Options)` / `toAddReassignees(Options)`。

---

## 7. UI Schema 模板（v1 schema uid 的生成与结构）

| 配置项 | 存储位置 | 默认/新建 schema | 初始化器 | 关键结构 |
|---|---|---|---|---|
| `workflow.config.applyForm`（申请人界面 v1） | uiSchemas | `uiSchemas:getJsonSchema/{uid}`；无则新建 `{type:'void', name/uid, 'x-component':'Grid', 'x-initializer':'ApprovalApplyAddBlockButton'}`（L13800-13835） | ApprovalApplyAddBlockButton（aZ） | Apply form 区块 = `createFormBlockSchema({actionInitializers:'ApprovalApplyAddActionButton', actions:{submit:…}})`，submit 按钮 `x-decorator: ApplyActionStatusProvider {value: SUBMITTED}`、`useAction: {{useSubmit}}`、`x-settings: actionSettings:workflow:approval:apply`；ActionBar 外再包 `x-decorator: ActionBarProvider`（L13272-13435）；另有 Markdown 区块 |
| `workflow.config.approvalUid`（申请人界面 v2） | flow-engine 模型 | `loadOrCreateModel({use:'TriggerChildPageModel', subModels:{tabs:[TriggerChildPageTabModel]}, stepParams:{pageSettings…}})`（a5，L13474-13535） | — | 视图内 `collection` context 动态指向触发集合 |
| `node.config.applyDetail`（审批人界面 v1） | uiSchemas | 同上新建 Grid，`x-initializer: ApprovalProcessAddBlockButton`（L11100-11150） | ApprovalProcessAddBlockButton（oZ） | "Approval information"= `createReadPrettyFormBlockSchema({resource:'approvals'})` + `x-use-component-props: useApprovalInformationBlockProps`（把 approval/workflow/execution 灌入表单，ny L6336-6356）；"Process form"= `ApprovalFormBlockProvider` + FormV2(`useApprovalFormBlockProps`) + Grid(initializer `form:configureFields`，标题 Configure modifiable fields) + ActionBar(initializer `ApprovalProcessAddActionButton`)（oQ，L10790-10886）；数据块 = 触发器 useInitializers（"Original application content"，dataPath `$context.data`）+ 上游各节点 useInitializers（Node result 子菜单）（L10940-10980） |
| `node.config.approvalUid`（审批人界面 v2） | flow-engine 模型 | `loadOrCreateModel({use:'ApprovalChildPageModel', subModels:{tabs:[ApprovalChildPageTabModel]}, stepParams:{ApprovalChildPageSettings:{init:{dataSourceKey,collectionName}}}})`（o5，L11246-11310） | — | 集合变化时 `setStepParams + setCollectionCtx + save` |
| `workflow.config.taskCardUid`（My applications 卡） | flow-engine 模型 | `ApplyTaskCardDetailsModel` + `ApplyTaskCardGridModel`，detailsSettings.layout horizontal（a9，L13638-13745） | — | context 注入 workflow/dataDataSourceKey/dataCollectionName/form |
| `node.config.taskCardUid`（My approvals 卡） | flow-engine 模型 | `ApprovalTaskCardDetailsModel`（aO，12110 处引用） | — | 同上 |

- taskCard 无自定义时的兜底：§3.2/§3.3 的 Descriptions 卡。
- v1 视图渲染弹层 schema 是**代码生成而非模板**：`ra`（L7970，approvals-view）/`nN`（L7191，approvalRecords-view）在模块加载时即通过 `storePopupContext` 预存两个 popup context（L9389-9404），保证任意列表都能打开详情。

---

## 8. 通知模板（notifications 与 approvalMsgTpls）

### 8.1 NotificationFieldset（ov，L9804-9868）

- 行结构：`channel`（Select，**disabled**，enum=`notificationChannels.list({pageSize:200})` 的 name/title，L9499-9520；新增行由 `NotificationAddition or`（L9461-9497）从同一资源挑选未用 channel，工作流已执行后隐藏）+ `templateType`（enum=`G.N4`：template / custom，默认 template；切换时清空 template，L9775-9779）+ `template`（TemplateConfig om，L9758-9802）+ Remove。
- 字段集标题按 `type` 区分（tP，L5125-5136）：**todo** "Todo notifications — Send notifications to assignees when approval todo is assigned."（触发器用 done、节点用 todo，见 §6）。

### 8.2 template 的两种形态（templateType）

- `template`：`RemoteSelect approvalMsgTpls`，过滤 `{ notificationType: <所选 channel 的 notificationType>, type: <todo|done> }`（L9788-9800，notificationType 由 `oi`（L9533-9540）从 channel 记录取）。
- `custom`：打开 "Configure template" modal，内嵌 notification-manager 的 `ContentConfigForm`（of，L9676-9745），变量选项 `useContentConfigFormProps oc`（L9560-9566）= channelType + workflow 变量（`useWorkflowVariableOptions`），提交把 `form.values.template` 写回。

### 8.3 approvalMsgTpls（模板库）

- 集合定义（模块 4700，L2045-2108）：`notificationType`（Channel type，enum `{{notificationTypeOptions}}` —— 由 notification-manager 的 `useNotificationTypes()` 提供，即各通道的类型标识，如 in-app/email 等服务端枚举；**客户端未硬编码 `approval-todo-in-app-message` 这类常量**，该形制是服务端/通道侧命名，bundle 中仅出现前缀式字符串 `approval-todo-`（打印 DOM id））、`title`（Template title）、`type`（Message type：todo/done，todo 默认，带描述 "Notify approver when task starts." / "Notify applicant when approval is approved, rejected or returned."，L2069-2086）、`template`(json)。
- 管理页 ly（L14734-14940，挂在 `notification-manager.templates`，aclSnippet `pm.notification.templates`）：ResourceActionProvider `approvalMsgTpls.list {sort:['-createdAt'], except:['config']}`；表格列 type/title/notificationType + 行编辑/删除；新增/编辑 Drawer 表单（lp：type + title，L14560-14588）+ ContentConfigForm。
- 模板变量：
  - todo 页 `useApprovalTodoMessageVariables ld`（L14589-14620）：`applicant.nickname`、`approval.workflowTitle/approvalId/dataKey/nodeTitle/approvalRecordTitle/approvalRecordId`、`system.now`。
  - done 页 `lf`（L14621 起）：`statusText`（Status）+ `approval.workflowTitle/approvalId/dataKey` 等。

---

## 9. i18n 线索（功能清单证据）

提取自主 bundle 的 `t()/e7()/MZ()/translate()` 字面量（去重后 220 条；e7 为 bundle 内 t 包装）。按功能域分组（保留英文原文）：

**状态/记录**
Aborted, Assigned, Approved, Canceled, Comment, Current approval record, Current status, Delegated, Draft, Execution reason, Failed to load approval data, Processing, Processed at, Processed status, Rejected, Returned, Status, Submitted, Unprocessed, Withdrawn, Workflow failed, Belonged approval, Approval applications, Approval executions, Approval records, Approval todos, Approval ID, Approval data key, Record ID, Record not found, Assignee, Assignee ID, Assignees, Assignees added, Added assignees, Delegated to, Applicant, Initiator, Created at, Last updated at, Updated at, Duration, Nodes count, Node title, Task ID, Task node, Task title, User, User not found, Nickname, Workflow, Workflow title, Workflow is not existed, Disabled

**发起/申请**
Apply, Apply form, Apply new, Initiations, Initiator's interface, Usage instructions, Click to initiate approval, Save draft, Submit, Withdraw, Only draft or returned approvals can be resubmitted., This operation can not be revocated. Please confirm before submitting., Submitted failed, Submitted successfully, Withdrawn failed, Withdrawn successfully, Only specific approval node（及退回组，见下）

**处理**
Approve, Reject, Return, Delegate, Add assignee, Added, Add Order, Before Me, After Me, Assignees scope, Show extra field in search list（枚举值见 §4.2；该 key 在候选里）, No extra field, Node to return to, Applicant (restart), Any previous approval node, Previous N approval nodes, Only specific approval node, Negotiation mode, Or, And, Voting, The approval or rejection by anyone of them is the result., If it's approved by all, it's approved. If it's rejected by anyone, it's rejected., Approved if the approval rate is greater than the set percentage, otherwise rejected., Order, Parallelly, Sequentially, Multiple approvers can approve in any order., Multiple approvers in sequential order., Pass mode, Passthrough mode, Branch mode, When rejected or returned, the workflow will be terminated immediately., Could run different branch based on result., End the workflow after rejection branch, When checked, the workflow will terminate when the rejection branch ends., Disable auto pass, When checked, this node will not auto pass even if auto pass is enabled in approval trigger., Auto pass, Auto pass if approver has already approved in current round, Auto pass if approver is applicant

**中心/卡片**
My applications, My approvals, Todos, Done, My applications card, My approvals card, Key information displayed in the My applications list., Key information displayed in the My approvals list., Assigned at, Related approvals, Approval process, Approval information, Original application content, Details, Apply（时间线首行）, No data yet

**触发器配置**
Trigger mode, Before data saved, After data saved, Data will not be saved until it has been approved., Data will be saved first, then the approval process will begin., Where to initiate, Initiate in data blocks only, Initiate in both data blocks and to-do center, Actions from any form block can be bound to this workflow…, In addition to data blocks, user also could initiate and process approvals in the to-do center…, Who could initiate, All users, Only selected users, No user selected, Available roles, Selected roles, Role, Applicant, Role of applicant, Trigger data, Choose a record or primary key of a record in the collection to trigger., Record show mode in the flow, Snapshot, Latest, Applicant and approvers will see the record as it was when they entered…, Applicant and approvers will always see the latest version of the record…, Use same task title for all approval nodes, By checking this on, will use the same task title…, The title set in approval trigger will be used as the task title., Preload associations, Please select the associated fields…, Association data loading mode is deprecated, This workflow uses legacy mode…, Migrate, Trigger collection required, Triggered when an approval request is initiated through an action button or API…

**界面配置/设计器**
Approver's interface, For initiating approvals, or viewing and manipulating initiated approvals., Configure actions, Configure modifiable fields, Process form, Process settings, Approval blocks, Data blocks, Other blocks, Add block, Form, Markdown, Node result, Configure template, Go to configure, Go to configure (v1), v1 (Legacy), v2, Configure v2 UI, Before using the v2 UI, you must delete the existing v1 UI…, Delete v1 configuration, Deleted successfully, Delete failed, Withdrawable changes unsaved…（`Withdrawable changes unsaved, click "Submit" to save.`）

**通知**
Notification channel, Add channel, Template type, Template title, Channel type, Message type, Message template, To do, Todo notifications, Done notifications, Notify approver when task starts., Notify applicant when approval is approved, rejected or returned., Send notifications to assignees when approval todo is assigned., Send notifications to applicant when approval is done., Approval message templates, System variables, System time, Approval message templates 相关变量（见 §8.3）

**通用/杂项**
Actions, Add new, Edit, Delete, View, Filter, Refresh, Cancel, Confirm, Collection, Fields, Select, Select record, Name, Title, Mode, No available items, No selected items, Data approved, Approval Data, Approval node, Approve node, Please configure a collection in the trigger node first…, Please configure the collection in the trigger first., The approval is not exists, please contact administrator., The approval related collection is not exists, please contact administrator.

**分包追加（v2 页面）**
aborted with parent execution, canceled manually, timed out, created by, form is not available, modal service is not available, approval interface cannot be displayed on the new page, the v2 approval interface is not configured., this approval was configured in an older version and cannot be used on the new page. return to the legacy page to process it., return to legacy page, js block, ok, print, triggers

---

## 10. API 调用清单（资源:动作 + 参数形状）

### 10.1 审批业务资源

| 调用 | 参数 | 用途 | 证据 |
|---|---|---|---|
| `approvals.create` | `{values:{collectionName, data, status, workflowId}, updateAssociationValues}` | 首次发起（含草稿） | L4237；v2 L16519/L19284 |
| `approvals.update` | `{filterByTk, updateAssociationValues, values:{collectionName, data, status}}` | 草稿/退回后再提交（status=SUBMITTED/DRAFT） | L7538；v2 L16506/L19271 |
| `approvals.withdraw` | `{filterByTk, values?:{data}}`（data=assignedValues 解析结果） | 撤回 | L7606；v2 L19679 |
| `approvals.destroy` | `{filterByTk}` | 删除草稿/退回件 | L7639 |
| `approvals.get` | `{filterByTk, except:['data'], appends:['workflow.title']}` | 申请详情弹层取数 | L8894；v2 chunk-756:L1731 |
| `approvals.listMine` | `{filter: rz[tab] (+workflowKey), sort:['-id']}` | 我的申请 | L8747-8757 |
| `approvalRecords.listMine` | `{filter: r$[tab] (+ 'workflow.key'), sort:['-id']}` | 我的审批 | L8905-8916 |
| `approvalRecords.add` | `{filterByTk: recordId, values:{assignee: number[], order: -1|1}}` | **加签**（ADDED） | L6201；v2 L20560 |
| `approvalRecords.delegate` | `{filterByTk: recordId, values:{assignee}}` | **委派**（DELEGATED） | L6242；v2 L21482 |
| `approvalRecords.submit` | `{filterByTk, updateAssociationValues, appends?, values:{…表单值, comment?, status: APPROVED|REJECTED, data}}` | 同意/拒绝 | L6300（动态名）、L20883、L21776 |
| `approvalRecords.return` | `{filterByTk, updateAssociationValues, appends?, values:{…, comment, status: RETURNED, data, returnToNodeKey?}}` | 退回（returnToNodeKey: 0=申请人重启，否则节点 key） | L6300、L22315 |
| `approvalRecords.reassignees` `.list`（resourceOf 记录 id） | `{type:'toAdd'|'toDelegate', pageSize:200, filter?}`（filter 为搜索串） | 加签/委派候选人（服务端按节点范围过滤，可带 extraFieldKey 展示字段） | v1 schema L6535/L6628；v2 L20379/L21289（um，L20089） |
| `approvalRecords.get` | `{filterByTk, appends}` | v2 任务详情取数 | chunk-756:L1739 |
| `approvalAudiences.list` | `{filter:{workflowId}, paginate:false}` | 读取"谁可发起" | L12818 |
| `approvalAudiences.replace` | `{filter:{workflowId}, values:[{workflowId, type:'role', targetKey…}]}` | 保存"谁可发起" | L12678 |

### 10.2 平台资源

| 调用 | 参数 | 用途 | 证据 |
|---|---|---|---|
| `workflows.listApprovalFlows` | `{filter:{'config.centralized':true}, page, pageSize:20, sort:['-createdAt']}` | Apply new 流程列表（服务端自定义 action） | L4459；chunk-756:L1218 |
| `workflows`（updateNodeConfig） | `POST` 节点 config 保存（V.updateNodeConfig，resourceName=workflows） | v1/v2 界面切换、退回范围回写 | L11115-11119、L13608 |
| `userWorkflowTaskStats.listMine` | `{type: taskType, page, pageSize:200, search}` → rows `{workflowKey,title,stats}` | 中心侧栏工作流分组+角标（workflow 插件） | wf-client.js:L27836 |
| `notificationChannels.list` | `{pageSize:200[, fields:['name','title']]}` | 通知字段集 channel 候选 | L9482、L9501 |
| `approvalMsgTpls.list` | `{filter:{notificationType, type}}` / `{sort:['-createdAt'], except:['config']}` | 模板选择 / 模板管理页 | L9791、L14748 |
| `users.list` | `{filter:{nickname:{$includes}}}` 等 | 审批人/申请人 RemoteSelect | L19811、L14390 |
| `roles.list` | `{paginate:false}` | audienceType=role Transfer；applicantRoleName | L15065、L14402 |
| `uiSchemas.insert` | `{values: schema}` | 新建 applyForm/applyDetail/按钮内嵌表单 schema | L10299、L10701、L11150、L13835 |
| `uiSchemas:getJsonSchema/{uid}` | GET | 读取 v1 schema 供设计器 | L11126、L13822 |
| `uiSchemas:remove/{uid}` | POST | 删除 v1 schema（切 v2 时） | L11451、L13556 |
| `ws:message:workflow:tasks:updated` | websocket 事件 | 中心列表/角标自动刷新 | wf-client.js:L31415 |

（`listApprovalFlows` 之外，approvals 资源的动作 `listMine/withdraw/get/create/update/destroy` 与 approvalRecords 的 `listMine/submit/return/add/delegate/reassignees` 均为服务端为该插件扩展的 action。）

---

## 11. 异步分包（14 个）角色速览

| Chunk | 大小 | 角色 | 关键证据 |
|---|---|---|---|
| 114 | 154K | react-to-print（打印详情） | 主包 `j.e("114")` L5270 |
| 143 | 6K | 新一代画布模型：ApprovalBlockGridModel / ApprovalChildPage* / ErrorFlowModel | chunk-143 字符串 |
| 344 | 5K | TriggerBlockGridModel（触发器画布区块） | chunk-344 |
| 427 | 5K | 画布"Add block"菜单模型（含 JSBlockModel） | chunk-427 |
| 502 | 16K | My applications 卡模型（ApplyTaskCardDetails*，"Approval Data"） | chunk-502 |
| 51 | 12K | 新一代审批区块（ApprovalInitiations/TodosBlockModel） | chunk-51 |
| 524 | 9K | 详情/错误模型（"Failed to load details"） | chunk-524 |
| 654 | 6K | Approval information 区块（ApprovalDetailsItemModel） | chunk-654 |
| 733 | 22K | My approvals 卡模型（ApprovalTaskCardDetails*） | chunk-733 |
| 756 | 36K | **新一代任务中心审批页**：listApprovalFlows Drawer、approvals.get/approvalRecords.get popup、"v2 interface is not configured" 兜底、跳转 `/admin/workflow/tasks/approval-apply/pending` | chunk-756:L1218、L1731、L1739 |
| 773 | 16K | Related approvals 新一代区块（RelatedApprovalsModel） | chunk-773 |
| 828 | 82K | **新一代处理动作全家桶**：ApplyForm/ProcessForm（Approve/Reject/Return/Delegate/Add assignee/Withdraw/Delete）模型与 modal，reassignees 搜索、`__workflowApprovalHideApplyFormDeleteAction` 标志 | chunk-828、主包 L19977（8401 模块） |
| 863 | 6K | `ApprovalTriggerExecuteConfig`（触发器执行配置：data/applicantId/applicantRoleName） | 主包 L14060 懒加载 |
| 984 | 3K | ApplyFormModel / ApplyFormSubmitModel | chunk-984 |

---

## 12. 最重要的 5 个发现

1. **审批中心不是本插件的路由，而是"任务类型"**：审批把 `approval-apply`(My applications)/`approval-todos`(My approvals) 两个 taskType 注册进 workflow 插件的通用任务中心（`registerTaskType`，L25745），复用其路由 `/admin/workflow/tasks/:taskType?/:status?/:popupId?`、pending/completed/all 三个 tab、以及 `userWorkflowTaskStats.listMine` 驱动的侧栏工作流分组（wf-client.js:L27836）。要"复刻"审批中心，先复刻这套任务中心契约。
2. **加签/委派统一走 `approvalRecords.reassignees` 候选接口 + `approvalRecords.add/delegate`**：加签 `add({filterByTk, values:{assignee[], order:-1|1}})`（order 仅顺序签署节点可见、且要求开启 negotiation，L6596-6605）；委派 `delegate({filterByTk, values:{assignee}})`；候选人接口参数 `{type:'toAdd'|'toDelegate', pageSize:200}`，节点上的 `toAddReassignees/extraFieldKey` 控制候选范围与展示字段。
3. **同意/拒绝/退回是"schema 内按钮"而非硬编码**：处理界面（applyDetail）中的按钮 `x-action` 即目标状态数字（2/-1/1/8/99），提交时按 status 动态选择 `approvalRecords.submit` 或 `approvalRecords.return`（L6300）；退回范围由 Return 按钮的 `approvalReturnNodeSettings{type: any|count|specific|start}` 换算为 `returnTo(-1|N|nodeKey|null)` 与 `returnToNodeVariable`（L11094-11115），提交时带 `returnToNodeKey`（0=申请人重启）。
4. **`withdrawable` 由申请表单 schema 派生**：配置页没有该开关——设计器扫描申请表单中是否存在 `x-decorator: WithdrawActionProvider` 的区块来写回 trigger 的 `withdrawable`（L13786-13820），撤回按钮本身只在 `status===SUBMITTED && 创建者 && withdrawable` 时渲染（L7681）。
5. **v1/v2 双界面并存且互斥**：trigger 与 approval 节点各有两套界面配置（v1: `applyForm`/`applyDetail` = uiSchemas 中的 schema；v2: `approvalUid`/`taskCardUid` = flow-engine 模型 uid）；切到 v2 需先确认删除 v1（`uiSchemas:remove/{uid}` + `updateNodeConfig`，L13540-13560、L11440-11470），v2 bundle（chunk-756）在 v2 界面未配置时会提示"return to the legacy page"。这解释了仓库中 v1/v2 两个 bundle 的关系。

---

*报告完。所有行号基于美化产物，直接引用压缩包时请按符号名（如 `rz`、`r$`、`nN`、`nw`、`nx`、`nO`、`ek`、`li`、`aS`）定位。*
