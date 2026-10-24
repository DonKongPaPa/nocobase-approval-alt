# docs/13 · 前端功能点标记总表（NocoBase 审批插件 · v3 AI portal）

> 合并自 `docs/ledger-draft-phase13/` 九份分面草稿（surface-v1、surface-A ~ surface-H），合并日期 2026-10-21。各面的源文件清单、施工提示、功能点表（# / 功能点 / v2锚点 / API / 官方证据 / v3判定）一字不改地合并，仅按本文件结构重排与降级标题层级。

## 0. 文档头

### 0.1 目的

本表是 v3 AI portal 对审批插件（plugin-workflow-approval）前端能力的**全量复现施工规格 + 验收矩阵**。每一行功能点给出五要素：v2 兼容实现锚点（源文件:行号）、消费 API、官方证据出处、v3 判定——施工按「功能点 + 锚点」落地，验收按行勾稽。

### 0.2 口径

**功能点 = 用户可见界面能力 + 宿主注册面。**

- 用户可见界面能力：用户在界面上可见、可操作的能力（列表/卡片/弹窗/表单/时间线/配置面板/画布等）。
- 宿主注册面：向宿主注册的挂载点（registerTrigger / registerInstruction / registerTaskType / 模型 loader / 客户端集合 schema / i18n / 页签注册等），无独立界面但是能力生效的前提。
- 纯服务端行为原则上不在本表；唯一例外是 G 面按服务端契约登记的 4 条 server-keep 项（approvalMsgTpls 授权/集合定义/种子/发送链），因通知模板管理面的前端复刻以其为依赖。

### 0.3 方法

素材复用既有取证，**不重做官方 bundle 取证**：

- `docs/03`（v1 官方 bundle 分析）、`docs/04`（v2 官方 chunk 分析）、`docs/06`（lane 加载链）、`docs/09`(双端比对审计)、`docs/12`（元素注册表）。
- 各行「v2锚点」为草稿会话对兼容实现源码的实读行号；「官方证据」列转引上述文档的既有结论（docs/03 的 `L####` 为美化 bundle 行号，见其头注）。
- 兼容实现无对应官方证据的自有实现，按草稿原样标「兼容实现自实现」。

### 0.4 与 docs/14 对比报告的关系

本表「v3判定」列（portal-rebuild / server-keep / tbd）是草稿阶段的初判；**终态由 docs/14 对比报告回填**——v3 复现完成后按面对照实测结果，把 21 条 tbd 落定，把 portal-rebuild / server-keep 各行标注复现结论（回填位置见文末附录 A 占位）。

## 1. 汇总表

源文件均在 `plugin-workflow-approval/` 下（括号内为草稿登记行数）。

| 面 | 源文件 | 功能点数 | portal-rebuild | server-keep | tbd |
| --- | --- | ---: | ---: | ---: | ---: |
| v1 · v1 lane schema UI 兜底 | `src/client/index.jsx`(735) | 35 | 32 | 0 | 3 |
| A · 审批中心双列表 | `src/client-v2/models/centerBlocks.jsx`(490)、`approvalPageModels.jsx`(185)、`applyNew.jsx`(588) | 41 | 40 | 0 | 1 |
| B · 任务卡与五操作 | `models/applyTaskCardModels.jsx`(389)、`approvalTaskCardModels.jsx`(462)、`taskDetailCards.jsx`(511)、`patternFormModels.jsx`(2457，本面引用)、`registerModelLoaders.js`(166)、`index.jsx`(局部)、`shared.js` | 34 | 34 | 0 | 0 |
| C · 详情与时间线 | `models/approvalDetailsModels.jsx`(93)、`approvalTimeline.jsx`(954)；辅助锚点 `index.jsx` / `centerBlocks.jsx` / `shared.js` | 31 | 31 | 0 | 0 |
| D · 表单模型（发起/处理/评论） | `models/patternFormModels.jsx`(2457)、`registerModelLoaders.js`(165)、`shared.js`(285) | 45 | 44 | 0 | 1 |
| E · 配置面板（触发器/节点/画布/通知组） | `src/client-v2/fieldsets.jsx`(901)、`models/notificationsFieldset.jsx`(520)、`models/triggerPageModels.jsx`(116) | 43 | 43 | 0 | 0 |
| F · 审批人界面配置器 | `models/interfaceConfig.jsx`(759) | 33 | 20 | 0 | 13 |
| G · 通知模板管理页（approvalMsgTpls） | `models/notificationsFieldset.jsx`(520)、`registerCollections.js`(232)、`zh-CN.js`(402)、`shared.js`(285)、`index.jsx`(808)、`fieldsets.jsx`(901)、`server/collections/approvalMsgTpls.js`(22)、`server/notifications.js`(198)、`server/index.js`(428) | 22 | 16 | 4 | 2 |
| H · 注册基建 | `index.jsx`(808)、`models/registerModelLoaders.js`(165)、`registerCollections.js`(232)、`shared.js`(285)、`zh-CN.js`(402) | 33 | 32 | 0 | 1 |
| **合计** | — | **317** | **292** | **4** | **21** |

---

## 2. 面 v1 · v1 lane schema UI 兜底

> - **性质**：动态工作流 Phase 1.3 读码清单草稿（本文件为新建，未修改任何既有文件）。
> - **对象**：兼容实现仓库 `plugin-workflow-approval/src/client/index.jsx`（v1 lane schema UI 兜底 lane 本体）。
> - **行数实测**：`wc -l` = **735 行**（ask 记「约808行」，与实测不符，以实测为准）。
> - **取证纪律**：官方对照证据只引用既有取证 `docs/03-client-v1-analysis.md`（其中 `L####` 均指 `analysis/approval-client.beautified.js` 美化行号，见 docs/03 头注），未重做官方 bundle 取证；docs/04 / docs/09 / docs/12 引用均经本会话复读对应章节核实。
> - **列说明**：「v2锚点」列载入兼容实现锚点（ask 指定源文件 `src/client/index.jsx:行号`；本面即 v1 兜底 lane，代码就在该文件）。

### 源文件清单

| 文件 | 行数 | 角色 |
|---|---|---|
| `plugin-workflow-approval/src/client/index.jsx` | 735（实测） | 本面唯一源文件：v1 lane 客户端，单文件 CJS（`require` + `React.createElement`，无 JSX 编译依赖）；分段注释：trigger(:48) / instruction(:138) / helpers(:358) / task: apply(:379) / task: todos(:462) / task types(:671) / plugin(:719)；`module.exports = PluginApprovalClient` 双导出（:734-735） |
| `docs/03-client-v1-analysis.md` | 464 | 既有官方 v1 bundle 取证（只引用，不重做） |
| （关联）`plugin-workflow-approval/src/client-v2/`（fieldsets.jsx、index.jsx、models/） | — | v2 主 lane（docs/08/09/12 审计对象），不在本面；本面为兜底 lane，两 lane 并存于 `src/client` 与 `src/client-v2`（docs/06:12-24 三 lane 加载链） |

### 施工提示

逐类清点（ask 指定四类 + 实测补充）：

1. **ApprovalTrigger 字段集**（`index.jsx:52-114`，7 字段）：`collection`(:53-59, string, required, 自定义组件 #12) / `mode`(:60-70, number, Radio.Group) / `centralized`(:71-81, boolean, Radio.Group) / `withdrawable`(:82-88, boolean, Checkbox) / `recordShowMode`(:89-99, boolean, Radio.Group) / `autoPassIfApplicant`(:100-106, Checkbox) / `autoPassIfApprovedInRound`(:107-113, Checkbox)；另有 `createDefaultConfig`(:133-135, 5 键)。**与官方 v1 fieldset（docs/03 §6.1 表 17 项）差集**：缺 `audienceType`(选择器)/`usageInstructions`/`applyForm`(v1)/`approvalUid`(v2)/`taskCardUid`(v2)/`appends`/`associationShowMode`/`useSameTaskTitle`/`taskTitle`/`notifications` 及 `triggerFieldset`(data/applicantId/applicantRoleName)；**多出 `withdrawable` 显式字段**（官方 v1 由申请表单 schema 派生，docs/03 §5.4、§6.1 末注）。**语义陷阱**：①`mode` 取值官方 `1`=Before data saved、`0`=After data saved（默认先落库，docs/03 §6.1 L14095-14113），兼容实现 client(:66-69) 标成 `0`=Before/`1`=After，且兼容实现 server `src/server/trigger.js:75` 注释同为 "0 before-save, 1 after-save"——兼容实现两端内部自洽但与官方语义**互换**，v3 施工按官方值并复核服务端；②`centralized` 官方默认 `false`（仅数据块发起），兼容实现字段默认与 `createDefaultConfig` 均 `true`(:74, :134)——相反。
2. **ApprovalInstructionX 字段集**（`index.jsx:150-211`，7 字段）：`assignees`(:151-159, array, required) / `negotiation`(:160-166, number) / `order`(:167-173, boolean) / `branchMode`(:174-184, boolean, Radio.Group) / `endOnReject`(:185-195, boolean, x-reactions 依赖 branchMode) / `actions`(:196-203, array, Checkbox.Group, 默认 [2,-1,1,8,99]) / `forceManualApproval`(:204-210, boolean)。**与官方 v1 fieldset（docs/03 §6.2 表）差集**：缺 `applyDetail`(v1)/`approvalUid`(v2)/`taskCardUid`(v2)/`noCollectionWarning`/`title`(节点任务标题)/`notifications`；**多出 `actions` 显式 Checkbox.Group**（官方由设计器扫描 applyDetail schema 的 `x-action` 按钮收集为 `node.config.actions`，docs/03 §6.2 末注 L316）。**控件形态差**：官方 `order` 是 RadioWithTooltip 双选项（Parallelly/Sequentially，docs/03 §6.2 L12258-12270），兼容实现是单 Checkbox；官方 `branchMode` 编辑态 disabled（docs/12 表 #4），兼容实现未做 disabled。
3. **apply / todos 两类 task type**（:673-694 / :696-717，注册 :729/:730）：协议字段 `{key,title,collection,action,useActionParams,Item,Detail,getPopupRecord}`。**过滤集合差异（对照官方 v1）**：apply pending `[0,1,2,3]` 与官方 rz pending 一致（docs/03 §3.2 L8606-8613）；apply completed 兼容实现 `[4,-1,-2,-3]` **多含 FAILED(-2)**（官方 completed=[4,-1,-3] 不含 FAILED）；todos pending `{status:0,'approval.status':[2,3]}` 与官方 r$ 一致（docs/03 §3.3 L8664-8670）；todos completed 兼容实现仅 `[-1,1,2]`，**官方 6 态 [2,-1,1,3,4,8]（含 UNPROCESSED/PASSED/DELEGATED）**。getPopupRecord 兼容实现裸 `get({filterByTk})`，官方带 `except:['data'],appends:[...]`（docs/03 §2.1 L8894、docs/04 §6.1-6.2）。
4. **注册的组件**（`afterAdd` :722-731，共 4+1 项）：`app.addComponents({ApprovalCollectionSelector})`(:723-725 全局组件名) + `registerTrigger('approval')`(:727) + `registerInstruction('approval')`(:728) + `registerTaskType('approval-apply')`(:729) + `registerTaskType('approval-todos')`(:730)，workflow 缺席时可选链静默跳过。**官方 v1 load() 十步（docs/03 §1 L25741-25872）未复刻项**：`ApprovalBlock` 聚合组件（页面区块/Related approvals）、`audienceTypes.register('role')`、5 个 SchemaInitializer、4 个 SchemaSettings、`ExtendCollectionsProvider`（approvals/approvalRecords/approvalExecutions/approvalMsgTpls 4 集合客户端定义）、`addScopes`×2、`pluginSettingsManager` 通知模板页、`registerCollectionsToDataSource`——本面全部不提供，v3 若需这些能力须另行立项。
5. **API 参数风险（实测新增）**：`ReassigneeSelect`(:604-606) 传 `type='delegate'/'add'`，官方 v1/v2 传 **`'toDelegate'/'toAdd'`**（docs/03 §4.2 L6535/L6628、§12 发现 2；docs/04 §7.3）——兼容实现两端兼容性未验证，v3 施工必须用官方值或先打服务端验证。
6. **加签 order**：兼容实现硬编码 `order: 1`(:578)；官方 Before Me(-1)/After Me(1) 单选、默认 -1、仅 `node.config.order`（顺序签署）可见且 `!negotiation` 时禁用（docs/03 §4.2 L6596-6605）。
7. **Return 候选**：兼容实现取"全部上游 approval 类型节点"(:522-524)，忽略官方 `config.returnTo`（ANY/COUNT/SPECIFIC/START 换算，docs/03 §4.2 nh L6396-6420）；且无 "Applicant (restart)" 项（`returnToNodeKey=0`，docs/03 §10.1 return 行）。
8. **撤回/删除条件**：兼容实现 `canWithdraw = status===2 && config.withdrawable`(:414)、`canDelete = status===0`(:415)，**无创建者校验**；官方撤回还需 当前用户=createdBy（WithdrawActionProvider，docs/03 §4.3 L7681-7689）。
9. **纯前端兜底特性**：STATUS_TAG/RECORD_TAG 为纯文案 Tag（官方标签含图标 + editable/terminated 标记，docs/03 §0.3）；RECORD_TAG 补了官方标签表缺的 PASSED(4)（docs/03 §0.3 注）；StatusTag 未命中回落 default+数字(:43-46)。
10. **v3Action 分布**：35 点 = 32 portal-rebuild + 3 tbd（#4/#14/#35 宿主注册面）+ 0 server-keep（本面无纯 server 行为点，全部为 UI 能力或宿主注册面）。tbd 的含义：注册调用依赖 v3 宿主是否提供 workflow registry/任务中心/画布脚手架；其字段集与 UI 内容已按 portal-rebuild 规格逐点列出。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
|---|---|---|---|---|---|
| 1 | 我的申请状态标签映射（approvals.status 8 态） | plugin-workflow-approval/src/client/index.jsx:20-29 | 宿主注册面（纯前端常量） | docs/03 §0.3（官方 J2 枚举 L2481-2491、Wd 标签表 L2544-2586；官方另有图标/editable/terminated 标记）——兼容实现自实现（纯文案简化） | portal-rebuild |
| 2 | 审批记录状态标签映射（approvalRecords.status 10 态） | plugin-workflow-approval/src/client/index.jsx:30-41 | 宿主注册面（纯前端常量） | docs/03 §0.3（uy L2492-2504、ii/aN 标签表 L2601-2645；官方标签表不含 PASSED(4)，兼容实现补全）——兼容实现自实现 | portal-rebuild |
| 3 | StatusTag 通用标签组件（未知值兜底） | plugin-workflow-approval/src/client/index.jsx:43-46 | 宿主注册面 | 兼容实现自实现（官方走集合枚举 read-pretty 渲染 Tag，docs/03 §3.2 L130） | portal-rebuild |
| 4 | 审批触发器注册面 registerTrigger("approval") | plugin-workflow-approval/src/client/index.jsx:727（调用）；50-51（类+title「Approval event」） | 宿主注册面 | docs/03 §1（L25745 registerTrigger("approval", li)）、§6.1（li L14039-14470） | tbd（依赖 v3 宿主 workflow registry/画布；字段集见 #5-13） |
| 5 | 触发器字段：collection 数据表选择 | plugin-workflow-approval/src/client/index.jsx:53-59 | 宿主注册面（候选数据消费 collections:list，见 #12） | docs/03 §6.1 表 collection 行（官方 DataSourceCollectionCascader disabled 建后不可改 L14083；兼容实现未做 disabled） | portal-rebuild |
| 6 | 触发器字段：mode 触发时机单选 | plugin-workflow-approval/src/client/index.jsx:60-70 | 宿主注册面 | docs/03 §6.1 表 mode 行（官方 `1`=Before data saved、`0`=After data saved 默认，L14095-14113）——兼容实现取值语义互换（见施工提示 1①） | portal-rebuild |
| 7 | 触发器字段：centralized 发起范围单选 | plugin-workflow-approval/src/client/index.jsx:71-81 | 宿主注册面 | docs/03 §6.1 表 centralized 行（官方默认 false 仅数据块发起，L14114-14133）——兼容实现默认 true 相反 | portal-rebuild |
| 8 | 触发器字段：withdrawable 可撤回勾选 | plugin-workflow-approval/src/client/index.jsx:82-88 | 宿主注册面 | 官方 v1 fieldset 无此字段（由申请表单 schema 派生，docs/03 §5.4 L13786-13820、§6.1 末注）——兼容实现自实现为显式开关 | portal-rebuild |
| 9 | 触发器字段：recordShowMode 快照/最新单选 | plugin-workflow-approval/src/client/index.jsx:89-99 | 宿主注册面 | docs/03 §6.1 表 recordShowMode 行（同枚举同默认 false=Snapshot，L14195-14216；快照灌表单机制 §4.1 末段） | portal-rebuild |
| 10 | 触发器字段：autoPassIfApplicant 自动通过勾选 | plugin-workflow-approval/src/client/index.jsx:100-106 | 宿主注册面 | docs/03 §6.1 表（L14282-14288，同默认 false） | portal-rebuild |
| 11 | 触发器字段：autoPassIfApprovedInRound 自动通过勾选 | plugin-workflow-approval/src/client/index.jsx:107-113 | 宿主注册面 | docs/03 §6.1 表（L14274-14281，同默认 false） | portal-rebuild |
| 12 | 触发器 scope+组件：useApprovedCollections / ApprovalCollectionSelector（全局注册） | plugin-workflow-approval/src/client/index.jsx:116-131（定义）；723-725（addComponents） | collections:list | docs/03 §6.1 collection 行（官方 DataSourceCollectionCascader 仅 main/DB 数据源）——候选来源机制兼容实现自实现（Select showSearch） | portal-rebuild |
| 13 | 触发器 createDefaultConfig 默认配置 | plugin-workflow-approval/src/client/index.jsx:133-135 | 宿主注册面 | 官方 v1 新建 presetFieldset 仅 collection（docs/03 §6.1），centralized 官方默认 false——兼容实现自实现且 centralized/audienceType 默认值与官方不一致 | portal-rebuild |
| 14 | 审批节点指令注册面 registerInstruction("approval") | plugin-workflow-approval/src/client/index.jsx:728（调用）；148-149（类+title「Approval node」） | 宿主注册面 | docs/03 §1（L25745 registerInstruction("approval", aS)）、§6.2（aS L12156-12420） | tbd（依赖 v3 宿主 workflow registry/画布；字段集见 #15-21） |
| 15 | 指令字段：assignees 审批人数组（required） | plugin-workflow-approval/src/client/index.jsx:151-159 | 宿主注册面（候选经 #22 users:list） | docs/03 §6.2 表 assignees 行（ArrayItems+AssigneesSelect/AssigneesAddition L12219-12251）；docs/12 表 #5/#6/#7 | portal-rebuild |
| 16 | 指令字段：negotiation 协商模式 | plugin-workflow-approval/src/client/index.jsx:160-166 | 宿主注册面 | docs/03 §6.2 表 negotiation 行（0 或/1 会签/(0,1) 投票，L12252-12257）；docs/12 表 #8 | portal-rebuild |
| 17 | 指令字段：order 顺序签署 | plugin-workflow-approval/src/client/index.jsx:167-173 | 宿主注册面 | docs/03 §6.2 表 order 行（官方 RadioWithTooltip Parallelly/Sequentially L12258-12270；兼容实现为单 Checkbox，控件形态差）；docs/12 表 #9 | portal-rebuild |
| 18 | 指令字段：branchMode 直通/分支单选 | plugin-workflow-approval/src/client/index.jsx:174-184 | 宿主注册面 | docs/03 §6.2 表 branchMode 行（官方编辑态 disabled L12184-12218；兼容实现未做 disabled）；docs/12 表 #4 | portal-rebuild |
| 19 | 指令字段：endOnReject 拒绝分支后终止（branchMode 门控） | plugin-workflow-approval/src/client/index.jsx:185-195 | 宿主注册面 | docs/03 §6.2 表 endOnReject 行（L12279-12289）；docs/12 表 #10（官方 useWatch(["config","branchMode"]) 门控铁证）——兼容实现 x-reactions 同构 | portal-rebuild |
| 20 | 指令字段：actions 动作集 + ACTION_OPTIONS 枚举（2/-1/1/8/99） | plugin-workflow-approval/src/client/index.jsx:196-203（字段）；140-146（枚举） | 宿主注册面 | 官方无显式字段——由设计器扫描 applyDetail schema 的 x-action 收集（docs/03 §6.2 末注 L316）；五动作语义 docs/03 §4.2 按钮表——兼容实现自实现 | portal-rebuild |
| 21 | 指令字段：forceManualApproval 禁用自动通过 | plugin-workflow-approval/src/client/index.jsx:204-210 | 宿主注册面 | docs/03 §6.2 表 forceManualApproval 行（L12271-12278，同语义同默认） | portal-rebuild |
| 22 | 指令 scope：useUserOptions 用户搜索（防抖） | plugin-workflow-approval/src/client/index.jsx:213-230 | users:list | docs/03 §10.2（users.list 平台资源 L19811、L14390）——pageSize 50/$includes/300ms debounce 为兼容实现自实现 | portal-rebuild |
| 23 | 组件：ApprovalAssigneesEditor 三态行编辑器 | plugin-workflow-approval/src/client/index.jsx:232-318 | 宿主注册面（候选经 #22 users:list） | docs/03 §6.2 assignees 行（官方 AssigneesSelect r9）；docs/09 §5.1 K-1、§8（官方三态行=用户/变量/条件结构化面板）——兼容实现自实现（条件组为裸 JSON Input） | portal-rebuild |
| 24 | 组件：ApprovalNegotiation 协商选择器（投票百分比） | plugin-workflow-approval/src/client/index.jsx:319-354 | 宿主注册面 | docs/03 §6.2 negotiation 行（官方 Negotiation oh L9894-9950，投票默认 50%）；docs/12 表 #8 | portal-rebuild |
| 25 | 详情取数钩子 useApprovalDetail（todos/apply 分流） | plugin-workflow-approval/src/client/index.jsx:360-372 | approvals:get / approvalRecords:get | docs/03 §4.1（官方详情 Provider approvals.get {filterByTk} L7724-7835；弹层取数带 except/appends §2.1 L8894）——兼容实现自实现（裸 get） | portal-rebuild |
| 26 | UserInfo 用户名回退显示 | plugin-workflow-approval/src/client/index.jsx:374-377 | 宿主注册面 | 兼容实现自实现（nickname‖username‖#id） | portal-rebuild |
| 27 | 我的申请列表卡片 ApplyItem（点击进详情） | plugin-workflow-approval/src/client/index.jsx:381-407 | 宿主注册面（行数据来自 #29 的 approvals:listMine） | docs/03 §3.2 默认卡 rq（L8626-8660）；docs/09 §3 B2（D-3 族：官方任务卡两列栅格 vs 兼容实现紧凑三行卡） | portal-rebuild |
| 28 | 申请详情 ApplyDetail（撤回/删除草稿） | plugin-workflow-approval/src/client/index.jsx:409-460 | approvals:withdraw / approvals:destroy | docs/03 §4.3（官方撤回条件含 创建者=当前用户 L7681-7689；withdraw L7606、destroy L7639）——兼容实现缺创建者校验，兼容实现自实现 | portal-rebuild |
| 29 | applyTaskType 任务类型对象（approval-apply） | plugin-workflow-approval/src/client/index.jsx:673-694（定义）；729（注册） | approvals:listMine / approvals:get | docs/03 §2.1 表（rQ L8743-8900）、§3.2 rz 过滤（L8606-8613；官方 completed=[4,-1,-3] 不含 FAILED，兼容实现多含 -2）；docs/04 §6.1（同 key 协议） | portal-rebuild（注册机制依赖宿主任务中心，见施工提示 3） |
| 30 | 我的审批列表卡片 TodosItem | plugin-workflow-approval/src/client/index.jsx:464-490 | 宿主注册面（行数据来自 #34 的 approvalRecords:listMine） | docs/03 §3.3 默认卡 rH（L8672-8698）；docs/09 §3 B3（D-3 族） | portal-rebuild |
| 31 | 处理操作条 ActionButtons（同意/拒绝/退回/委派/加签+备注） | plugin-workflow-approval/src/client/index.jsx:492-596 | approvalRecords:submit / approvalRecords:return / approvalRecords:delegate / approvalRecords:add | docs/03 §4.2（按钮=x-action 状态数字表；submit/return 动态名 L6300-6310；delegate L6242；add order 官方 Before -1/After 1 默认 -1 且顺序签署可见性 L6596-6605；退回候选按 returnTo 换算 nh L6396-6420、returnToNodeKey=0 申请人重启 §10.1）；docs/04 §7.2/§7.3——兼容实现自实现（order 硬编码 1、忽略 returnTo、无 restart 项，见施工提示 6/7） | portal-rebuild |
| 32 | 加签/委派候选人选择 ReassigneeSelect | plugin-workflow-approval/src/client/index.jsx:598-618 | approvalRecords:reassignees:list | docs/03 §4.2（官方 resourceOf 记录 id、type 'toDelegate'/'toAdd'，L6535/L6628）、§12 发现 2；docs/04 §7.3——兼容实现传 'delegate'/'add' 与官方值不一致，兼容性未验证（施工提示 5） | portal-rebuild |
| 33 | 审批详情 TodosDetail（描述+审批记录列表+操作条） | plugin-workflow-approval/src/client/index.jsx:620-669 | 宿主注册面（数据经 #25 approvalRecords:get） | docs/03 §4.1 审批人视图 nF（L7022-7160）、§3.4 官方 ApprovalProcess 时间线（rounds/records 合并 rowSpan L9179-9336）——兼容实现以平面 List 简化；docs/09 §3 B7（官方时间线基线） | portal-rebuild |
| 34 | todosTaskType 任务类型对象（approval-todos） | plugin-workflow-approval/src/client/index.jsx:696-717（定义）；730（注册） | approvalRecords:listMine / approvalRecords:get | docs/03 §2.1 表（rZ L8901-9075）、§3.3 r$ 过滤（L8664-8670；官方 completed 6 态 [2,-1,1,3,4,8]，兼容实现仅 [-1,1,2]）；docs/04 §6.2 | portal-rebuild（注册机制依赖宿主任务中心，见施工提示 3） |
| 35 | 插件客户端注册面 PluginApprovalClient.afterAdd（全量注册入口） | plugin-workflow-approval/src/client/index.jsx:721-734 | 宿主注册面 | docs/03 §1（官方 load() 十步 L25741-25872；兼容实现仅复刻注册 4 项，ApprovalBlock/audienceTypes/SchemaInitializer×5/SchemaSettings×4/ExtendCollectionsProvider/addScopes/pluginSettingsManager 均未复刻，见施工提示 4） | tbd（依赖 v3 宿主形态） |

---

*报告完。所有 index.jsx 行号经本会话通读全文核实（Read 全文 735 行）；docs/03 引用保留其原 L####（美化为 analysis/approval-client.beautified.js 行号）；docs/04/09/12 引用经本会话复读对应章节。*

---

## 3. 面 A · 审批中心双列表

> 本表锚点省略公共前缀 `plugin-workflow-approval/src/client-v2/models/`（见下方源文件清单）。
> 官方证据仅引用既有取证（docs/04 §5 chunk 51/984/143/427/16/524、docs/09 §B1/B2/B3 列表比对小节、docs/12），未重做；兼容实现自有实现标「兼容实现自实现」。

### 源文件清单

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `plugin-workflow-approval/src/client-v2/models/centerBlocks.jsx` | 490 | 审批中心区块菜单 + 我的应用/我的审批双列表块 + 相关审批块 + 路由详情页模型（官方 chunk 51/16/524 + 模块 6760 的 1:1 模型移植） |
| `plugin-workflow-approval/src/client-v2/models/approvalPageModels.jsx` | 185 | 审批界面搭建器子页面骨架（ApprovalChildPage/Tab + Add block 网格，官方 chunk 143/427 + 模块 9738） |
| `plugin-workflow-approval/src/client-v2/models/applyNew.jsx` | 588 | 任务中心「发起新申请」抽屉/弹窗 + 页面级刷新/筛选动作 + URL 过滤契约（官方模块 9095 `eL`/eI/ej 的兼容实现等价） |

消费端（注册面接线，不在本面文件内但引用行号）：`plugin-workflow-approval/src/client-v2/index.jsx`（taskType 注册 :786-787、useActionParams 三层合并 apply :693-705 / todos :736-748、Actions 工具条 apply :708-724 / todos :751-768）。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | 审批中心区块菜单注册（Approval submenu：approval-initiations/approval-todos 两子项，menuType=submenu，label=t("Approval")） | centerBlocks.jsx:55-75 | 宿主注册面 | docs/04 §5 菜单模型（docs/04:304，模块 6760 主包:11176-11284） | portal-rebuild |
| 2 | 列表块模型工厂与详情视图动作（approvalBlockModelOptions：resourceSettings.init{dataSourceKey:main,collectionName}；subModels.detailViewAction=ViewActionModel，popupSettings.openView{mode:dialog,size:large,pageModelClass:ApprovalTaskRouteDetailPageModel}） | centerBlocks.jsx:26-53 | 宿主注册面 | docs/04:304（createModelOptions 附 detailViewAction，主包:11210-11239——列表行点击→大对话框→路由详情页模型） | portal-rebuild |
| 3 | 列表块基类（ApprovalTaskListBlockModel extends CollectionBlockModel；destroy 时 removeModelWithSubModels 清 detailViewAction 子模型；scene=many 场景注册） | centerBlocks.jsx:182-193 | 宿主注册面 | 兼容实现自实现（官方同款「卸载时 removeModelWithSubModels」语义见 docs/04:306） | portal-rebuild |
| 4 | 我的申请列表块（ApprovalInitiationsBlockModel：collection approvals、refreshAction=listMine、page1/pageSize20、sort[-createdAt]、appends[workflow]、hide:true 不进通用加块菜单） | centerBlocks.jsx:195-221 | approvals:listMine | docs/04 §5 item 12（docs/04:277，chunk 51:306-343、776-790） | portal-rebuild |
| 5 | 我的审批列表块（ApprovalTodosBlockModel：collection approvalRecords、listMine、sort[-createdAt]、appends[approval,approval.createdBy,node,workflow]、hide:true） | centerBlocks.jsx:223-249 | approvalRecords:listMine | docs/04 §5 item 13（docs/04:278，chunk 51:797-845） | portal-rebuild |
| 6 | 列表视图骨架（TaskBlockView：垂直 Space=工具栏+antd.List+简单分页容器；间距取 theme token；toolbar role） | centerBlocks.jsx:87-125 | 纯前端（消费各块 resource） | 兼容实现自实现（chunk 51 V/I/L 等价，头注释 centerBlocks.jsx:86；重型皮肤为已记录 lane） | portal-rebuild |
| 7 | 工具栏刷新按钮（aria-label Refresh + ReloadOutlined，loading 绑 resource.loading，onClick=model.refresh() 局部刷新） | centerBlocks.jsx:119-124 | approvals:listMine / approvalRecords:listMine（经 refresh） | docs/04:320（官方 Actions 工具条 Refresh/eI） | portal-rebuild |
| 8 | 列表行渲染（application 行=workflow.title‖`#id`，todo 行=node.title‖title‖`#id`；右侧状态 Tag；rowKey=record.id；split=false；状态映射 statusTag :81-84） | centerBlocks.jsx:126-152 | 纯前端 | docs/09 §B2/B3 列表比对（docs/09:182-192：官方配置驱动卡 vs 兼容实现紧凑行，D-3 族判定） | portal-rebuild |
| 9 | 行点击打开详情弹窗（openRecord：detailViewAction.uid 存在且 view.openView 可调且 record.id 非空 → openView{filterByTk:id, formData:record, mode:dialog, size:large, collectionName}） | centerBlocks.jsx:97-108 | 宿主注册面（详情数据由 #18 拉 approvals:get/approvalRecords:get） | docs/04:304 | portal-rebuild |
| 10 | 简易分页器（上一页/下一页+页码文本；hasPrev=page>1，hasNext=count 可得按 page*pageSize<count 否则 meta.hasNext；changePage=setPage+refresh；两端均不可翻时整块不渲染） | centerBlocks.jsx:154-178（判定 :90-94，翻页 :109-112） | 同 #7（listMine 经 refresh） | 兼容实现自实现（compact 分页；官方分页/排序 eL 见 docs/04:320） | portal-rebuild |
| 11 | 列表空态（antd.List locale emptyText=t('No data yet')） | centerBlocks.jsx:129 | 纯前端 | 兼容实现自实现 | portal-rebuild |
| 12 | 区块过滤契约常量（FILTER_KEY=workflowApprovalBlockFilter；PAGE_SIZES=[5,10,20,50,100]；APPLY_NONFILTERABLE / TODO_NONFILTERABLE 双清单） | centerBlocks.jsx:17-24 | 宿主注册面（过滤 schema 契约） | docs/04:277（chunk 51:306-343、776-790 nonfilterable）+ docs/04:333（todos 追加 user/approval.*） | portal-rebuild |
| 13 | 相关审批块（RelatedApprovalsModel extends DataBlockModel：approvals 资源、listRelated、pageSize 1、sort[-createdAt]；无 view.inputArgs.filterByTk 时 hide） | centerBlocks.jsx:253-272（hide 定义 :370-374） | approvals:listRelated | docs/04 §5 item 45（docs/04:301，chunk 16:1167-1196、936、285） | portal-rebuild |
| 14 | 相关审批过滤同步（resolveDataKey：collection.filterTargetKey 单键/多键排序后 JSON.stringify，缺则回退 filterByTk；syncRelatedFilter 合并 filter{dataKey, collectionName(非 main 源加 `<ds>:` 前缀)}） | centerBlocks.jsx:294-323 | approvals:listRelated（filter 参数） | 兼容实现自实现（chunk 16 语义；docs/04:486 记 listRelated filterByTk 契约） | portal-rebuild |
| 15 | 相关审批刷新与兜底（refresh：键不可得→清空 setData([])+meta 全 0；可得→resource.refresh；timelineRefreshVersion 自增作行 key 盐防复用；beforeRender 事件尾再同步一次） | centerBlocks.jsx:325-341 | approvals:listRelated | 兼容实现自实现 | portal-rebuild |
| 16 | 相关审批 dataScope 配置流（registerFlow relatedApprovalsSettings.steps.dataScope use='dataScope'，afterParamsSave→applyFlow+setPage(1)+refresh） | centerBlocks.jsx:375-388 | 宿主注册面（设置流）+ approvals:listRelated | docs/04:301（chunk 16 dataScope flow） | portal-rebuild |
| 17 | 路由详情页模型（ApprovalTaskRouteDetailPageModel extends FlowModel；onInit setProps showFlowSettings=false；渲染 RouteDetailFallback） | centerBlocks.jsx:392-401 | 宿主注册面 | docs/04 §5 item 14（docs/04:281，chunk 524:407-520） | portal-rebuild |
| 18 | 路由详情取数（RouteDetailFallback：inputArgs.collectionName∈{approvals,approvalRecords}→kind application/todo→resource；`ctx.api.resource(resource).get({params:{filterByTk}})`；inputArgs.formData 作 initial/无 id 兜底；cancelled 守卫防竞态） | centerBlocks.jsx:404-438 | approvals:get / approvalRecords:get | docs/04:281（chunk 524:225-249、374，getPopupRecord 语义） | portal-rebuild |
| 19 | 路由详情头部/关闭/刷新（标题 application=workflowTitle‖workflow.title‖title‖Details，todo=nodeTitle‖title‖node.title‖workflow.title；Close→view.close；Refresh→按 inputArgs.viewUid 找源模型→parent.resource.refresh） | centerBlocks.jsx:439-465 | 纯前端（复用父列表资源） | 兼容实现自实现（官方头部含打印 docs/04:281；兼容实现未复刻，Print 属版本偏移 docs/09:205） | portal-rebuild |
| 20 | 路由详情摘要与错误态（错误→Alert 'Failed to load details'；loading→Spin；正文 bordered Descriptions 单列：Status/Workflow/Node/Comment 条件渲染 + 底部 Refresh 按钮） | centerBlocks.jsx:467-486 | approvals:get / approvalRecords:get | 兼容实现自实现（module 3557 detail page 等价，头注释 centerBlocks.jsx:403） | portal-rebuild |
| 21 | 审批子页面模型（ApprovalChildPageModel extends ChildPageModel：disableFieldClickToOpen=true；setCollectionCtx 注入 collection 上下文；renderFirstTab→ApprovalGridLoader） | approvalPageModels.jsx:61-79 | 宿主注册面 | docs/04 §5 item 9（docs/04:270，chunk 143:141） | portal-rebuild |
| 22 | 子页面初始化流（ApprovalChildPageSettings.init handler→setCollectionCtx{dataSourceKey,collectionName}） | approvalPageModels.jsx:81-90 | 宿主注册面 | docs/04 §5 item 10（docs/04:271，chunk 143:388-395） | portal-rebuild |
| 23 | 子页面页签模型（ApprovalChildPageTabModel.renderChildren→ApprovalGridLoader(gridOptions(uid))，每 tab 独立网格） | approvalPageModels.jsx:92-96 | 宿主注册面 | docs/04:270-271（chunk 143 tabs→grid） | portal-rebuild |
| 24 | 网格懒加载与陈旧模型清理（ApprovalGridLoader：ensureApprovalModelLoaders+preloadModelLoaders+getModelClassAsync('ApprovalBlockGridModel')；removeStaleGridModel(:23-33) 删 ErrorFlowModel/非本类陈旧网格；loadOrCreateModel 后跨父 addDelegate；未就绪渲染 SkeletonFallback） | approvalPageModels.jsx:36-59 | 宿主注册面 | 兼容实现自实现（chunk 143 cleanup，头注释 approvalPageModels.jsx:22） | portal-rebuild |
| 25 | Add block 菜单（ApprovalBlockGridModel.renderAddSubModelButton 仅 flowSettingsEnabled 渲染；AddBlockMenu 三分组：Approval blocks[Process form] / Data blocks[Triggers,Node result] / Other blocks[Markdown,JS block]，groupHasChildren 滤空组） | approvalPageModels.jsx:116-183 | 宿主注册面 | docs/04 §5 item 11（docs/04:274，chunk 427:75-160、238-292） | portal-rebuild |
| 26 | Process form 模型选项工厂（processFormModelOptions：use=ProcessFormModel，resourceSettings.init{dataSourceKey,collectionName}，patternSettings.pattern=createNew，subModels.grid=PatternFormGridModel） | approvalPageModels.jsx:99-113 | 宿主注册面 | docs/04:274（chunk 427 ProcessFormModel+PatternFormGridModel）；同构官方先例 chunk 984 Add-block 网格 docs/04:298（chunk 984:104-150） | portal-rebuild |
| 27 | Triggers/Node result 菜单项桥接（plugin.getTriggerOptions(workflow.type).getCreateModelMenuItem({config,workflow})；plugin.getInstruction(node.type).getCreateModelMenuItem({node,workflow}) 遍历 inputArgs.availableUpstreams） | approvalPageModels.jsx:118-154 | 宿主注册面 | docs/04:274（Triggers 变量组、Node result 组） | portal-rebuild |
| 28 | 「发起新申请」主按钮与宿主槽（primary+PlusOutlined，桌面带文案/移动端 onlyIcon；onClick 开 Drawer；挂 taskType.Actions → 宿主 tabBarExtraContent） | applyNew.jsx:388-432（按钮 :425-432；挂载注释 :6-8） | 宿主注册面 | docs/09 §B1 D-6（docs/09:178）；挂载点修正记录 docs/08:319 | portal-rebuild |
| 29 | 直连 API 通道（api()：NOCOBASE_TOKEN Bearer + X-Data-Source: main 头；GET/POST `/api/<action>`；params 值 JSON 序列化；错误取 errors[0].message） | applyNew.jsx:46-65 | 通用通道（供 #33/#38/#40 消费） | 兼容实现自实现 | portal-rebuild |
| 30 | 页面级刷新动作（RefreshAction：ReloadOutlined→window.location.reload()；onlyIcon 形态） | applyNew.jsx:106-117（偏差注释 :70-74） | 纯前端（整页刷新） | docs/04:320（官方 eI）；alpha.9 无 reload 通道的取舍 docs/08:323 | portal-rebuild |
| 31 | URL 过滤契约（APPLY_FILTER_KEY=workflowApprovalApplicationsFilter / TODOS_FILTER_KEY=workflowApprovalTodosFilter :76-77；readUrlFilter JSON 解析守卫（非 object/数组→undefined）；mergeFilters=官方 eu：非空 filter AND 合并；writeUrlFilter 空删有写+history.replaceState） | applyNew.jsx:76-104 | 宿主注册面（由 useActionParams 合入 listMine filter，index.jsx:701/:744） | docs/04:319、332（两 URL 参数 key）；三层合并语义 docs/04:317 | portal-rebuild |
| 32 | 页面级筛选动作（FilterAction：Popover 260px；fieldSpec widget=multiSelect→Select multiple allowClear / dateRange→RangePicker；apply 时 dateRange 转 {$gte,$lte} 后 writeUrlFilter+整页 reload；reset 清参+reload；打开时回读 URL 草稿） | applyNew.jsx:120-197（apply/reset :128-146） | 宿主注册面（URL 参数→listMine filter） | docs/04:320（官方 ej 写 URL 契约）；E2E docs/10 T13（docs/10:74：8 态枚举+URL 参数+收窄+重置） | portal-rebuild |
| 33 | 抽屉工作流列表取数与分页（fetchApplyFlows→workflows:listApprovalFlows {filter,page,pageSize:20,sort:-createdAt}；total 取 meta.count‖rows.length；仅 total>20 渲染分页且 showSizeChanger:false；空态 'No data yet'） | applyNew.jsx:208-216（分页 :482-495） | workflows:listApprovalFlows | 兼容实现自实现（官方 eL Drawer 契约对照 docs/08:316；服务端 action 定义 docs/03:417；E2E docs/10:85） | portal-rebuild |
| 34 | 抽屉紧凑筛选（Popover：Name→title $includes 模糊 + ID 纯数字输入；buildUserFilter 单条直用/多条 $and（:199-206）；Reset 清草稿回页 1；Filter 应用回页 1） | applyNew.jsx:442-477 | workflows:listApprovalFlows（filter 参数） | 兼容实现自实现（官方 CollectionFilter[id/title/createdBy] 的紧凑等价，docs/08:316） | portal-rebuild |
| 35 | 抽屉刷新（refresh=tick 自增触发重取，保留当前筛选与页码） | applyNew.jsx:478-480（机制 :411,:398-408） | workflows:listApprovalFlows | 兼容实现自实现 | portal-rebuild |
| 36 | 工作流卡片与可用性门控（usable=invalid!==true && (config.approvalUid‖config.applyForm)；标题+usageInstructions‖『点击发起审批』描述；invalid 红色感叹 Tooltip；不可点=aria-disabled+not-allowed；右箭头装饰） | applyNew.jsx:497-546 | 纯前端 | 兼容实现自实现（官方卡片同构 docs/08:316：invalid 感叹号/不可点条件一致） | portal-rebuild |
| 37 | 发起弹窗三分支（Modal width 800/footer null/标题=工作流名：有 config.approvalUid→ApplyFormContent；仅旧 config.applyForm→Result+『返回旧版页面』按钮 href=/admin/workflow/tasks/approval-apply/pending（legacyHref :421）；都没有→Result 『未配置』） | applyNew.jsx:550-583 | 纯前端 | docs/04:325-326（官方 eU 旧版提示与 Result 未配置分支语义） | portal-rebuild |
| 38 | 发起界面树提取（loadApplyFormTree：flowModels:get{filterByTk:uid}+flowModels:list{pageSize:200} 建 byParent；findApplyForm 按 /ApplyFormModel$/ 深度≤6 下钻（:218-226）；gridRow 取 /GridModel$/；fields=子项 stepParams.fieldSettings.init{fieldPath,collectionName‖workflow.config.collection,dataSourceKey‖main}） | applyNew.jsx:229-243（消费 :296-329） | flowModels:get, flowModels:list | 兼容实现自实现（D-3 先例：任务中心页无 FlowContext 走 flowModels 树，docs/08:321） | portal-rebuild |
| 39 | 发起表单字段编辑器（FieldEditor 按 field.interface 分派：DATE_INTERFACES→DatePicker(datetime 带 showTime)；NUMBER→InputNumber；select/radioGroup→Select(ui.enum)；checkbox/boolean→Switch(valuePropName=checked)；textarea/markdown/richText→TextArea；TEXT/未知→Input；关联字段→Input(target 占位，记录偏差)；required 规则取 uiSchema，校验失败留表单） | applyNew.jsx:265-289（Form.Item 装配 :360-376） | 纯前端 | 兼容实现自实现（D-3 紧凑皮，docs/08:321；官方活体基准 docs/10:126） | portal-rebuild |
| 40 | 提交发起（submit(2)：form.validateFields→按 fieldPath 组 data→approvals:create {collectionName,workflowId,status:2,data}（平铺 body）→成功 toast『Submitted successfully』+关弹窗→400ms 整页刷新；校验错误静默留表单，其余 message.error） | applyNew.jsx:339-357（按钮 :380-382） | approvals:create | docs/04 §7.1（docs/04:362 官方首次发起 approvals:create——注意官方为 {updateAssociationValues,values:{…}} 包裹，兼容实现为平铺 body，见施工提示） | portal-rebuild |
| 41 | 存草稿动作（官方 ApplyFormSaveDraftModel 默认 hide:true、每表单可配 toggleable；兼容实现紧凑皮未渲染动作按钮，submit 的 status 参数（0=草稿）保留 API 通道；偏差注释 :377-379） | applyNew.jsx:377-379（status 形参 :339） | approvals:create（status:0，兼容实现未出按钮） | docs/04:354（官方 submit→SUBMITTED(2)/save draft→DRAFT(0)）+ applyNew.jsx:377-379 兼容实现注释 | tbd |

### 施工提示

**挂载拓扑（先读）**
- 双列表块经 `ApprovalBlocksMenuModel` submenu 挂数据页面；两个列表块 `hide:true`（centerBlocks.jsx:218/:246），不出现在通用加块菜单，只能由菜单子项创建。
- `RefreshAction/FilterAction/ApplyNewAction` 的宿主槽是任务中心 v1 页的 `taskType.Actions`（tabBarExtraContent，右侧；桌面无 props、移动端 `{onlyIcon}`）——接线在 index.jsx:708-724（apply 页=刷新+筛选+发起新申请）与 :751-768（todos 页=刷新+筛选，官方无发起按钮，docs/04:320），注册在 index.jsx:786-787。
- 三 tab（待处理/已完成/全部）由宿主渲染；tab 过滤合并发生在 index.jsx useActionParams（:693-705 apply：pending status=[0,1,2,3]、completed=[4,-1,-2,-3]、all={}；:736-748 todos：pending={status:0,approval.status:[2,3]}、completed=[-1,1,2]），与 URL filter、左侧栏 workflowKey 三层 AND 合并（官方 eu 语义）。

**两套「双列表」勿混用**：页内块（centerBlocks：approvals/approvalRecords，sort `-createdAt`，appends 见 #4/#5）与任务中心列表（index.jsx taskType：sort `-id`，apply appends=[workflow,createdBy]（:703）、todos appends=[node.title,workflow.title,approval,approval.workflow]（:746））是两组不同资源参数。本面只覆盖前者模型 + 后者的 Actions/ApplyNew。

**列与卡片皮肤**：页内块为单列紧凑行（名称+状态 Tag，centerBlocks.jsx:139-151）；任务中心列表卡由 v1 宿主 Item 组件渲染（不在本面三文件；官方基准与 D-3 修复记录见 docs/09 §B2/B3，docs/09:182-192、:225）。

**过滤**：
- 块级契约常量 FILTER_KEY/PAGE_SIZES/NONFILTERABLE（centerBlocks.jsx:17-24）——v3 复现过滤 schema 时按官方 chunk 51 的 nonfilterable 双清单排除字段。
- 页面级 URL filter：`writeUrlFilter` 空删有写 + `history.replaceState`；`readUrlFilter` 解析失败/非对象一律 undefined；`mergeFilters` 只 AND 非空项；apply/reset 后**整页 reload**（alpha.9 宿主无 reload 通道的记录偏差，applyNew.jsx:70-74；v3 宿主若提供 reload 通道应改接通道而非整页刷新）。
- 筛选字段：apply 页=状态多选+申请时间范围；todos 页=处理状态/审批状态多选+创建时间范围（fields 由 index.jsx:713-716/:757-761 构造传入 FilterAction）。

**排序**：页内块 `-createdAt`；任务中心 `-id`；Apply new 抽屉 `-createdAt`（pageSize 均 20）。

**刷新**：页内块=model.refresh() 局部刷新（centerBlocks.jsx:123）；任务中心页=整页 reload（偏差，#30）；抽屉=tick 重取、保筛选保页码（#35）。

**发起入口**：仅任务中心 apply 页有（ApplyNewAction→Drawer(workflows:listApprovalFlows)→Modal 800→approvals:create）；页内审批中心块无发起入口；todos 页官方与兼容实现均无。

**空态**：所有列表 `No data yet`（centerBlocks.jsx:129、applyNew.jsx:486）；未配置发起界面→Empty（applyNew.jsx:332-338）或 Result（applyNew.jsx:580）；路由详情取数失败→Alert（centerBlocks.jsx:467）。

**详情链路**：列表行点击→openView(dialog,large,formData 带入)→ApprovalTaskRouteDetailPageModel→approvals:get / approvalRecords:get({filterByTk})→Descriptions(Status/Workflow/Node/Comment)。官方头部含打印按钮（docs/04:281），兼容实现未复刻——Print 属 alpha.10 宿主能力/版本偏移（docs/09:205）。

**API 形状注意（v3 复现必读）**：兼容实现 `approvals:create` 发平铺 body `{collectionName, workflowId, status, data}`（applyNew.jsx:344-348），而官方线格式为 `{updateAssociationValues, values:{collectionName, data, status, workflowId}}` 包裹（docs/04:362）。本会话未实测服务端对两种 body 的兼容性（如实标注）；v3 建议走宿主 api resource 客户端（`api.resource('approvals').create({values:{…}})`）对齐官方线格式。

**v3 判定统计**：41 条 = 40 portal-rebuild + 1 tbd（#41 存草稿：官方默认隐藏、逐表单可配，是否在 v3 portal 暴露取决于宿主动作配置形态）；无 server-keep（三文件均为界面/注册面；被消费的 server action——approvals:listMine/listRelated/get/create、approvalRecords:listMine/get、workflows:listApprovalFlows、flowModels:get/list——保留在服务端，见各行 api 列）。

---

## 4. 面 B · 任务卡与五操作

> 面范围：任务中心弹窗/列表卡的任务卡体系（我的申请卡 chunk 502、我的审批卡 chunk 733、弹窗左列卡片 module 3557 语义复刻）+ 审批人五操作（通过/拒绝/退回/委派/加签，chunk 828）。
> 依据：只引用既有取证（docs/04 §5/§6/§7/§10/§11、docs/09 §1.3/§1.4、docs/12 表 12），未重做官方 bundle 分析；五操作与部分卡片在兼容实现仓库有自有实现，锚点给到兼容实现行号。

### 源文件清单

| 文件 | 行数 | 角色 | 官方对应 |
| --- | --- | --- | --- |
| `plugin-workflow-approval/src/client-v2/models/applyTaskCardModels.jsx` | 389 | 我的申请卡（Approve 前）模型 4 件套 + 审批数据虚拟字段机制 | chunk 502 / webpack module 6461（1:1 port，文件头 :1-10） |
| `plugin-workflow-approval/src/client-v2/models/approvalTaskCardModels.jsx` | 462 | 我的审批卡模型 4 件套 + 快照/实时取数策略 + legacy 迁移 | chunk 733 / module 3300（1:1 port，文件头 :1-10） |
| `plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx` | 511 | 任务中心弹窗左列 4 卡 + 列表卡字段栅格（轻量 React.createElement 复刻） | module 3557 语义复刻（文件头 :1-9） |
| `plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx` | 2457 | 五操作动作模型 + 评论表单 + 审批界面容器（本面引用，不全文重读） | chunk 828 / module 1695（1:1 port，文件头 :1-11） |
| `plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js` | 166 | 上述模型类的 flowEngine 注册面 | 官方 main-bundle module 9813（1:1 port，:1-5） |
| `plugin-workflow-approval/src/client-v2/index.jsx` | —（局部） | 轻量任务中心原型：五操作按钮组、待办/申请详情卡片组装配 | 兼容实现自有实现 |
| `plugin-workflow-approval/src/client-v2/models/shared.js` | — | 状态枚举与 META 表（APPROVAL_STATUS :13-22、RECORD_STATUS :24-36、RECORD_TYPE :38-44、RETURN_TYPE :48、RETURN_NODE_OPTIONS :50-55、状态 LIST :57-83、TASK_CARD_HIDDEN_FIELDS :165） | chunk 828/3557 常量 |

### 施工提示

#### 五操作施工矩阵（通过 / 拒绝 / 退回 / 委派 / 加签）

| 操作 | 按钮形态 | 前置状态 | 确认流 | 意见输入 | 提交 API |
| --- | --- | --- | --- | --- | --- |
| 通过 Approve | `type: 'primary'`（patternFormModels.jsx:2045） | 待办记录 `status === 0(PENDING)` 才可见（`ApprovalActionModel.isRuntimeVisible` :2018-2021：`status` 键缺失或 PENDING；`ASSIGNED=null` 亦隐藏，isRecordPending :845-847）；按钮是否出现在节点由 `nodeConfig.actions` 含 `2` 决定（原型兜底清单 [2,-1,1,8,99]，index.jsx:533、:535） | `ctx.modal.confirm` 弹窗（actionDialog :1227-1245：icon null、maskClosable false、OK/Cancel、宽 520、zIndex+1000、内容包 FlowEngineProvider）内渲染评论表单 | CommentFormModel：默认警示 markdown「This operation can not be revocated…」+ 可配置 comment 多行文本（:730-837）；onOk `form.validateFields()`（:1439） | `approvalRecords:submit` `{filterByTk, updateAssociationValues, appends, values:{...commentValues, status:2, data}}`（:1449-1454） |
| 拒绝 Reject | `danger`（:2055） | 同上，actions 含 `-1`（:539） | 同上 | 同上 | `approvalRecords:submit` `{...values:{status:-1}}`（同 :1449-1454） |
| 退回 Return | default（:2065） | 同上，actions 含 `1`（:543）；**可退范围由节点 `config.returnTo` 决定**：-1→全部上游+发起人（`Applicant (restart)` value 0）、正数 N→最近 N 个上游（不足补发起人）、字符串→仅指定节点（returnNodesFor :1123-1136；上游链回溯 walkUpstreamApprovalNodes :1138-1149 兜底 :1420-1422） | 同上，弹窗评论表单后附加 `returnToNodeKey` Select（:1426-1431；仅一项时 disabled :1117；默认取第一项 :1105、:1113） | 同上 + `returnToNodeKey` 合入 values（:1442-1445） | `approvalRecords:return` `{...values:{status:1, data, returnToNodeKey}}`（:1449-1454）；**配置态**把范围选择落盘 `flow_nodes:update {filterByTk: nodeId, values:{config}}`（returnTo / returnToNodeVariable 映射 :1367-1390 → persistNodeConfig :1016-1028） |
| 委派 Delegate | default（:2075） | actions 含 `8`（:605）；候选人由服务端按受托范围返回，前端不枚举 | Modal.confirm + ReassignForm（:1601-1612） | 无意见输入 | `approvalRecords:delegate` `{filterByTk, values:{assignee}}`（:1622-1625） |
| 加签 Add assignee | default（:2081） | actions 含 `99`（:606）；`order` 字段仅 `nodeConfig.order===true` 显示（:1598）、`nodeConfig.negotiation` 为空（Or=0）时禁用（:1599，与 docs/04 §7.3「Or(0) 时禁用」一致） | 同上 | 无 | `approvalRecords:add` `{filterByTk, values:{assignee[], order?}}`（:1622-1625） |

**加签/委派选人交互**（ReassignForm :1474-1542）：Select 远程搜索（onSearch→setSearch，ahooks useRequest `debounceWait: 300`，:1483-1495），filter = `{nickname|username: {$includes: term}}`（:1485-1491）；端点 `approvalRecords.reassignees/<recordId>:list {type: 'toDelegate'|'toAdd', pageSize: 200, filter?}`（:1492；docs/04 §11.1:487）；选项 label = `nickname||username||email||id` + extraFieldKey 无边框 Tag（:1499-1507）；delegate 单选 / add `multiple`（:1520）；order Radio `Before Me(-1)/After Me(1)`（:1529-1540），表单初值 order=-1（:1511）。**配置态受托范围**（AssigneesScopeEditor）：节点 `config.toDelegateReassignees/toAddReassignees`（元素=用户变量串 `{{ctx…}}/{{$…}}` 或 users filter 组）+ `…Options.extraFieldKey`，保存时统一规范化为 `{filter}` 写回（defaultParams :1554-1572、afterParamsSave :1579-1590）；编辑器列表行支持变量输入/filter 面板/上移下移删除，Add 菜单 `Select users / Query users`（:1972-1983），extraFieldKey 从 users 集合选一字段（:1985-1998）。

**成功/失败闭环**：成功 → `form.resetFields()` + `view.close()` + `inputArgs.refresh()`（:1456-1459、:1626-1629）；退回额外 `markApprovalsDirty` 同时失效 approvals/approvalRecords 两个数据源（:907-913、:1455）；失败 → `message.error(t('Submitted failed'))`（:1462、:1632）。API 缺失守卫：`approvalRecords:<action> is required`（recordsResource :921-925）。

**评论模型生命周期**：动作模型添加为子模型时即 `loadOrCreateModel` 并把 uid 存入 `clickSettings.saveResource.commentModelUid`（ensureCommentModelUid :1247-1253、afterAddEnsureComment :2039-2042）；运行时按 uid 复用同一模型实例（:1404-1414），上下文 delegate + 强制关闭 flowSettings（:1413-1414）。

#### 卡片字段布局

- **弹窗左列卡片组装配顺序**（待办详情）：BusinessRecordCard(head=「Original application content」) → RecordStatusCard → ApplyCard → TaskNodeCard → 操作区（index.jsx:631-635；结构对照 docs/09 §1.4 左列卡 1-4）。申请详情为 BusinessRecordCard（无 head）+ ApplyCard + 撤回/删除按钮（index.jsx:444-477，撤回条件 status===2 且 withdrawable :439、删除 status===0 :440）。
- **BusinessRecordCard 字段栅格**（:175-244）：FieldGrid 两列 `repeat(2, minmax(0,1fr))`、gap `14px 24px`，label 带尾冒号 13px `rgba(0,0,0,.65)` 在上、值在下（:153-170）；hasMany → 通栏子表（子集合前 5 个非系统字段为列，>10 行分页 pageSize 10，:124-150）；值渲染 renderFieldValue：enum→色 Tag、date/datetime 截 19 位 `T`→空格、dateOnly 截 10 位、数值千分位、boolean Yes/No、belongsTo 标题回退链 customer_name/full_name/nickname/name/title/id（:67-121）；排除系统字段/virtual/space（:65、:205-207）；**快照关联缺失时按 `workflow.config.appends` 实时补齐**：`<业务集合>:get {filterByTk: approval.dataKey, 'appends[]': appends}`（:189-199）。
- **RecordStatusCard**（:249-269，我的审批视图独有）：Descriptions column 1：Status（RECORD_STATUS_META 色系 Tag）/ Assignee / Processed at（仅终态显示：非 PENDING 且非 ASSIGNED，:252-262）。
- **ApplyCard**（:274-281）：Card title `t('Apply')`，正文发起人头像+昵称。
- **TaskNodeCard**（:294-356）：按 jobId 分桶取**最新 job** 的记录行（:298-308）；卡片标题=节点名，extra=会签 pill（1→And、0<n<1→Voting(>N%)、否则 Or，无边框 Tag，:285-291）；每行 = 头像昵称+状态 Tag+右下角时间（12px 灰）+ 意见 blockquote 灰底（:320-352）。
- **TaskCardFields**（列表卡内嵌，:432-495）：按 `approval.workflow.config.taskCardUid` 拉 flowModels 树 items；`status`→审批状态 Tag、`createdAt/updatedAt`→时间文本、`data.*`→业务集合 fieldMap 取标题并按类型渲染、其余字段直取 approval 列（taskCardFieldValue :399-406）；末尾固定追加「Last updated at」；**JS 自定义项（isJs）跳过不渲染**（:467）；渲染 Descriptions column 2 colon（:488-494）。
- **数据来源链**：列表卡数据来自 `approvals:listMine` / `approvalRecords:listMine`；弹窗记录由任务中心 `getPopupRecord`（`approvals:get` / `approvalRecords:get`）注入；卡片内实时补齐/元数据另发 `collections:get` 与 `<业务集合>:get`。

#### 未取证 / 不确定项（如实标注）

1. **TaskCardCommonItemModel**：两个 Grid 的第三字段项基类（applyTaskCardModels.jsx:145、approvalTaskCardModels.jsx:293）在本仓库**未找到实现**，靠 `getModelClassName` 动态取名 + `filter(Boolean)` 兜底缺失；官方行为对照未取证，v3 施工时若缺失该类需自行决定是否补齐。
2. **actions 兜底清单**：原型 `nodeConfig.actions ?? [2,-1,1,8,99]`（index.jsx:533）是兼容实现自设兜底；官方在节点未配置 actions 时的默认展示集未取证（官方配置态为空清单则五操作均不渲染，patternFormModels.jsx:2389-2396 仅增删不设默认）。
3. **退回单选 disabled 条件** `returnToNodes.length <= 1`（:1117）为兼容实现细节，docs/04 §7.2 仅记录展开逻辑，官方是否同款 disabled 未逐字取证。
4. **CommentFormItemModel 的 subKey/subType（'field'/'object'）与 jsonb 意见对象**：对象感知渲染已在 docs/09 §1.3 差异 3 闭环（comment 列 text→jsonb）；taskDetailCards.jsx 的 commentText 由 approvalTimeline 提供（:20 引入），本面未展开。
5. docs/12 表 12（「My approvals card → Go to configure」）仅覆盖 taskCardUid 的**配置入口**（审批节点抽屉），卡片本身官方活体样本不可得（docs/09 §1.5：可操作弹窗官方 demo 无样本，以 bundle 代码为基准）。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | 申请卡详情块模型（ApplyTaskCardDetailsModel） | plugin-workflow-approval/src/client-v2/models/applyTaskCardModels.jsx:57-116 | 宿主注册面 | docs/04 §5 条5（chunk 502）；兼容实现自实现 | portal-rebuild |
| 2 | 申请卡「Card settings」标题/描述设置 flow | plugin-workflow-approval/src/client-v2/models/applyTaskCardModels.jsx:119-137 | 宿主注册面 | docs/04 §5:264（chunk 502:634-669）；兼容实现自实现 | portal-rebuild |
| 3 | 申请卡字段栅格与「Fields」配置按钮（ApplyTaskCardGridModel） | plugin-workflow-approval/src/client-v2/models/applyTaskCardModels.jsx:139-163 | 宿主注册面 | docs/04 §5:265（chunk 502:688-719）；兼容实现自实现 | portal-rebuild |
| 4 | 申请卡字段项模型（系统字段子项生成，ApplyTaskCardDetailsItemModel） | plugin-workflow-approval/src/client-v2/models/applyTaskCardModels.jsx:167-229 | 宿主注册面 | docs/04 §5:266；兼容实现自实现 | portal-rebuild |
| 5 | 审批数据虚拟字段机制（data/dataAfter→业务集合 belongsTo） | plugin-workflow-approval/src/client-v2/models/applyTaskCardModels.jsx:38-55、231-268（VIRTUAL_RELATIONS :380-383） | 宿主注册面 | docs/04 §5:266（chunk 502:877-930 附近）；兼容实现自实现 | portal-rebuild |
| 6 | 申请卡关联字段组（Display association fields 树） | plugin-workflow-approval/src/client-v2/models/applyTaskCardModels.jsx:275-387 | 宿主注册面 | docs/04 §5:267（chunk 502:1106）；兼容实现自实现 | portal-rebuild |
| 7 | 审批任务卡详情块模型（ApprovalTaskCardDetailsModel，快照/实时 + legacy 迁移） | plugin-workflow-approval/src/client-v2/models/approvalTaskCardModels.jsx:113-252 | `<业务集合>:get`（实时补齐 :223-229） | docs/04 §5:290（chunk 733）；兼容实现自实现 | portal-rebuild |
| 8 | 审批卡记录取数策略（getRecordStrategy 快照∪dataBefore∪dataAfter vs Latest） | plugin-workflow-approval/src/client-v2/models/approvalTaskCardModels.jsx:162-197 | `<业务集合>:get` | docs/04 §5:290；docs/04 §7.4:415-417（同款策略）；兼容实现自实现 | portal-rebuild |
| 9 | 审批卡「Card settings + Details settings」双 flow（refresh/layout） | plugin-workflow-approval/src/client-v2/models/approvalTaskCardModels.jsx:255-285 | 宿主注册面 | docs/04 §5:290（chunk 733:1031-1100）；兼容实现自实现 | portal-rebuild |
| 10 | 审批卡字段栅格与「Fields」配置按钮（ApprovalTaskCardGridModel） | plugin-workflow-approval/src/client-v2/models/approvalTaskCardModels.jsx:287-306 | 宿主注册面 | docs/04 §5:291（chunk 733:1101-1146）；兼容实现自实现 | portal-rebuild |
| 11 | 审批任务卡字段项模型（RECORD_FIELDS 六字段，label「Approval task」sort 100） | plugin-workflow-approval/src/client-v2/models/approvalTaskCardModels.jsx:310-370 | 宿主注册面 | docs/04 §5:292（chunk 733:1333）；兼容实现自实现 | portal-rebuild |
| 12 | 审批卡关联字段组与黑白名单（workflow.title/approval.createdBy.nickname 白名单） | plugin-workflow-approval/src/client-v2/models/approvalTaskCardModels.jsx:372-460 | 宿主注册面 | docs/04 §5:293；兼容实现自实现（chunk 733 黑白名单逐条还原） | portal-rebuild |
| 13 | 业务集合元数据缓存（fields/fieldMap，repository 双形态兼容） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:44-61 | collections:get | 兼容实现自实现 | portal-rebuild |
| 14 | 业务记录详情卡（Original application content：两列字段栅格 + 子表 + 快照补齐） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:175-244 | collections:get + `<业务集合>:get {filterByTk, appends[]}`（:193） | docs/09 §1.4（左列卡 1）；docs/04 §10（Original application content）；兼容实现自实现 | portal-rebuild |
| 15 | 字段值渲染器（enum Tag/日期/千分位/布尔/关联标题回退链 + hasMany 子表） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:67-150 | 宿主注册面 | 兼容实现自实现 | portal-rebuild |
| 16 | 当前记录状态卡（Status/Assignee/Processed at，终态才显示时间） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:249-269 | 宿主注册面 | docs/09 §1.4（左列卡 2）；兼容实现自实现 | portal-rebuild |
| 17 | 发起人卡（Apply + 用户） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:274-281 | 宿主注册面 | docs/09 §1.4（左列卡 3）；兼容实现自实现 | portal-rebuild |
| 18 | 当前节点卡（最新 job 分桶 + 会签/或签/投票 pill + 意见引用块） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:294-356 | 宿主注册面 | docs/09 §1.4（左列卡 4）；兼容实现自实现 | portal-rebuild |
| 19 | 列表卡任务卡字段栅格（TaskCardFields：taskCardUid items + data.* 快照 + 固定 Last updated at） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:432-495 | flowModels:get + flowModels:list | docs/04 §6.1:321（taskCardUid 渲染）；docs/09 §1.4；兼容实现自实现 | portal-rebuild |
| 20 | 任务卡 items 装配器（flowModels 树 get + 全表分页本地建树，按 sortIndex 排序） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:363-396 | flowModels:get + flowModels:list | 兼容实现自实现（module 3557 语义） | portal-rebuild |
| 21 | 审批/记录状态标签（META 表色系+图标 Tag，无 meta 回退原值） | plugin-workflow-approval/src/client-v2/models/taskDetailCards.jsx:410-429 | 宿主注册面 | docs/04 §2 常量表；兼容实现自实现 | portal-rebuild |
| 22 | 审批动作基类与运行态可见性守卫（ApprovalActionModel：PENDING 才可见、配置模式拦截） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:2005-2035 | 宿主注册面 | docs/04 §7.4:419；兼容实现自实现 | portal-rebuild |
| 23 | 通过（Approve：primary 按钮 → 评论确认弹窗 → submit status=2） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:2044-2052（流程 :1290-1471） | approvalRecords:submit | docs/04 §7.2:375、§11.2:503；兼容实现自实现 | portal-rebuild |
| 24 | 拒绝（Reject：danger 按钮 → 同款弹窗 → submit status=-1） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:2054-2062 | approvalRecords:submit | docs/04 §7.2:376、§11.2:503；兼容实现自实现 | portal-rebuild |
| 25 | 退回（Return：可退范围配置/运行时展开 returnToNodeKey 下拉 → return status=1） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:2064-2072（范围配置 :1300-1366、落盘 :1367-1390、可退节点 :1123-1149、选择器 :1095-1121/:1426-1431） | approvalRecords:return + flow_nodes:update（配置态） | docs/04 §7.2:377-390、§11.2:504；兼容实现自实现 | portal-rebuild |
| 26 | 委派（Delegate：服务端受托范围候选人单选 → delegate） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:2074-2078（范围编辑 :1554-1590、选人表单 :1474-1542、提交 :1613-1634） | approvalRecords:delegate + approvalRecords.reassignees:list + flow_nodes:update | docs/04 §7.3:396-407、§11.1:487、§11.2:505；兼容实现自实现 | portal-rebuild |
| 27 | 加签（Add assignee：多选 + order Before/After Me，negotiation Or 时 order 禁用） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:2080-2084（多选 :1520、order :1529-1540、门控 :1598-1599） | approvalRecords:add + approvalRecords.reassignees:list + flow_nodes:update | docs/04 §7.3:397-407、§11.2:506；兼容实现自实现 | portal-rebuild |
| 28 | 意见输入表单模型组（CommentFormModel/Grid/Item + 不可撤销警示 markdown） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:730-837 | 宿主注册面 | docs/04 §7.2:383、:391；兼容实现自实现 | portal-rebuild |
| 29 | 操作确认弹窗容器（actionDialog：520 宽 confirm + FlowEngineProvider 内容） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:1227-1245 | 宿主注册面 | docs/04 §7.0:349（chunk 828 ts）；兼容实现自实现 | portal-rebuild |
| 30 | 受托人范围编辑器（AssigneesScopeEditor：变量/filter 行 + Select users/Query users + extraFieldKey） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:1645-2001 | flow_nodes:update | docs/04 §7.3:400-401；兼容实现自实现 | portal-rebuild |
| 31 | 审批界面容器（ProcessFormModel：pattern 决策/快照策略/动作清单同步/运行态记录信息面板） | plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx:2334-2455（ApprovalRecordInfo :1155-1216） | flow_nodes:update（动作清单同步） | docs/04 §7.4:409-420；兼容实现自实现 | portal-rebuild |
| 32 | 任务卡/审批界面模型注册面（registerApprovalModelLoaders：extends+loader 注册表） | plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js:68-139 | 宿主注册面 | docs/04 §1.4（registerModelLoaders）、§5:253-301；兼容实现自实现 | portal-rebuild |
| 33 | 五操作轻量原型（ActionButtons + ReassigneeSelect：status!==0 隐藏、actions 含判断、退回 Modal.info 选节点、委派/加签 Modal.confirm 选人） | plugin-workflow-approval/src/client-v2/index.jsx:501-618 | approvalRecords:submit/return/delegate/add + approvalRecords.reassignees:list | 兼容实现自实现 | portal-rebuild |
| 34 | 待办详情左列卡片组装配（BusinessRecordCard(head) → RecordStatusCard → ApplyCard → TaskNodeCard → 操作区） | plugin-workflow-approval/src/client-v2/index.jsx:626-637 | 宿主注册面 | docs/09 §1.4（结构顺序 1-4）；兼容实现自实现 | portal-rebuild |

> 范围说明：#1-#21 为任务卡面（三个指定源文件）；#22-#31 为五操作面（锚点为兼容实现 1:1 移植实现，官方对照取自 docs/04 §7 既有取证，未重做 bundle 分析）；#32-#34 为宿主注册面/兼容实现自有原型。撤回/删除/存草稿等发起人操作不属本面（B 面仅审批人五操作），见 surface 相邻清单。

---

## 5. 面 C · 详情与时间线

> 面范围：审批详情模型注册面（approvalDetailsModels）+ 审批过程时间线（approvalTimeline）及其宿主弹窗嵌入。
> 生成日期：2026-10-21。除本文件外未修改任何文件。

### 源文件清单

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `plugin-workflow-approval/src/client-v2/models/approvalDetailsModels.jsx` | 93 | chunk 654（module 9181）1:1 移植：ApprovalDetails 4 个模型类（:1-8 文件头标注） |
| `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx` | 954 | 官方私有 bundle module 7781（xY/xG）/ 2062（`O`）/ 9488（ws）/ 7886（formatDateTime）移植（:1-10 文件头标注） |
| `plugin-workflow-approval/src/client-v2/index.jsx`（辅助锚点） | — | TaskDetailLayout 弹窗左右布局（:375-414）、弹窗数据 appends（:362-363）、approvals:get/approvalRecords:get（:420、:486） |
| `plugin-workflow-approval/src/client-v2/models/centerBlocks.jsx`（辅助锚点） | — | chunk 16 RelatedApprovalsModel「相关审批」块（:251-391），按施工提示要求清点 |
| `plugin-workflow-approval/src/client-v2/models/shared.js`（辅助锚点） | — | 状态枚举与 META 表（:13-83）、APPROVAL_DETAILS_HIDDEN_FIELDS（:166） |

辅助锚点三处均为本次会话实读（非指定主源文件），列入清单是因施工提示要求清点弹窗布局与相关审批块；若 surface D/F 已登记 index.jsx / centerBlocks.jsx 同名能力，以彼处为准、此处条目仅作时间线面的依赖说明。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
| --- | --- | --- | --- | --- | --- |
| C-01 | 审批详情模型 ApprovalDetailsModel | `plugin-workflow-approval/src/client-v2/models/approvalDetailsModels.jsx:15` | 宿主注册面 | docs/04 chunk 654 表行 + §5 条目 1 | portal-rebuild |
| C-02 | 审批详情网格模型 ApprovalDetailsGridModel | `plugin-workflow-approval/src/client-v2/models/approvalDetailsModels.jsx:33` | 宿主注册面 | docs/04 chunk 654 表行 + §5 条目 2 | portal-rebuild |
| C-03 | 审批信息字段项模型 ApprovalDetailsItemModel | `plugin-workflow-approval/src/client-v2/models/approvalDetailsModels.jsx:37` | 宿主注册面 | docs/04 chunk 654 表行 + §5 条目 3 | portal-rebuild |
| C-04 | 关联字段分组模型 ApprovalDetailsAssociationFieldGroupModel | `plugin-workflow-approval/src/client-v2/models/approvalDetailsModels.jsx:84` | 宿主注册面 | docs/04 chunk 654 表行 + §5 条目 4 | portal-rebuild |
| C-05 | dayjs relativeTime 内联补丁 | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:44` | 宿主注册面 | 兼容实现自实现（官方 7781 `i.dayjs.extend` 移植，:1-10） | portal-rebuild |
| C-06 | 本地时间格式化 formatDateTime | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:92` | 宿主注册面 | 兼容实现自实现（module 7886 移植，:90） | portal-rebuild |
| C-07 | 审批翻译钩子 useApprovalTranslate | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:103` | 宿主注册面 | docs/04 §chunk 表「931 共享组件（9488 引用）」行 | portal-rebuild |
| C-08 | `{{t(...)}}` 标签模板编译 compileTemplate | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:110` | 宿主注册面 | 兼容实现自实现 | portal-rebuild |
| C-09 | comment 对象感知渲染 commentText | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:132` | 宿主注册面 | docs/09 §1.3 表行 3 + §5 台账 #3/#4 | portal-rebuild |
| C-10 | 记录装饰 decorateRecordItem（转签/加签挂接） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:176` | 宿主注册面 | 兼容实现自实现（官方 `q` 移植，:175 注释） | portal-rebuild |
| C-11 | 卡片稳定键 stableKey | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:190` | 宿主注册面 | 兼容实现自实现（官方 `J` 移植，:189 注释） | portal-rebuild |
| C-12 | 用户 Chip（头像+姓名） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:219` | 宿主注册面 | 兼容实现自实现（官方 `$` 移植） | portal-rebuild |
| C-13 | 时间线样式组（缩进/虚线尾/卡片 hover/引用块） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:242` | 宿主注册面 | docs/09 §3 B7 复核（时间线双端一致）；样式本体兼容实现自实现 | portal-rebuild |
| C-14 | dot 图标表 DOT_ICONS（12 枚） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:333` | 宿主注册面 | 兼容实现自实现 | portal-rebuild |
| C-15 | dot 颜色映射（job 状态→记录状态 META） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:349` | 宿主注册面 | docs/09 §1.3 表行 2 + §5 台账 #2 + §3 B7 复核 | portal-rebuild |
| C-16 | 发起成功 dot 常量 INITIATED_DOT | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:370` | 宿主注册面 | docs/09 §3 B7 复核（发起 dot 绿、aria 语义一致） | portal-rebuild |
| C-17 | 20×20 圆形状态圆点 StatusDot | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:373` | 宿主注册面 | docs/09 §1.3 表行 2（紫色圆 tag aria=Returned）+ §3 B7 | portal-rebuild |
| C-18 | 协商模式 Pill（And/Voting/Or） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:399`（标签计算 :618-625） | 宿主注册面 | docs/09 §1.4 条目 4（节点卡会签/或签 pill）+ §3 B7 复核 | portal-rebuild |
| C-19 | 时间文本 TimeText | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:416` | 宿主注册面 | 兼容实现自实现（官方 `Z`） | portal-rebuild |
| C-20 | Job 头（创建时间+耗时）JobHeader | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:431` | 宿主注册面 | docs/09 §3 B7 复核（耗时 dayjs 相对时间） | portal-rebuild |
| C-21 | 轮次头 RoundHeader | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:459` | 宿主注册面 | 兼容实现自实现（官方 `et`；多轮标签 :577） | portal-rebuild |
| C-22 | 可点击卡片工厂 actionCard + ApprovalTimelineActionCard | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:491`（卡片 :499） | 宿主注册面 | 兼容实现自实现（export xY） | portal-rebuild |
| C-23 | 时间线首条「Apply」提交节点 | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:554` | 宿主注册面 | docs/09 §1.4 条目 3（Apply 卡）+ §3 B7 | portal-rebuild |
| C-24 | job 节点卡（逐记录行+extras） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:595` | 宿主注册面 | docs/09 §1.4 条目 4 + §3 B7 复核 | portal-rebuild |
| C-25 | 撤回节点（round.status=-4） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:729` | 宿主注册面 | docs/09 §2 B7（撤回条目 1:1） | portal-rebuild |
| C-26 | 终态节点（execution failed/aborted + reason） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:748` | 宿主注册面 | 兼容实现自实现（:912-916 reason 映射表） | portal-rebuild |
| C-27 | 轮次归集 collectRounds（草稿回退 null） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:781` | 宿主注册面 | docs/09 §2 B7；无轮次不渲染与官方 `ea` 一致 | portal-rebuild |
| C-28 | ApprovalTimeline 主组件（records→job 桶聚合） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:802` | 宿主注册面 | docs/09 §1.4（官方左列节点卡历史在右侧时间线）+ §3 B7 | portal-rebuild |
| C-29 | 任务中心时间线包装 TaskApprovalTimeline（模块导出面） | `plugin-workflow-approval/src/client-v2/models/approvalTimeline.jsx:919`（导出 :944-954） | 宿主注册面 | 兼容实现自实现（module 2062 `O`） | portal-rebuild |
| C-30 | 详情弹窗左右布局 TaskDetailLayout（列宽/gutter/窄屏 Tabs） | `plugin-workflow-approval/src/client-v2/index.jsx:375` | approvals:get / approvalRecords:get | docs/09 §1.3 表行 1 + §5 台账 #1 + §2 B5 | portal-rebuild |
| C-31 | 相关审批块 RelatedApprovalsModel | `plugin-workflow-approval/src/client-v2/models/centerBlocks.jsx:253` | approvals:listRelated | docs/04 chunk 16 表行 + §5 条目 45 | portal-rebuild |

### 施工提示

#### 1. 详情弹窗布局（列宽/gutter）——C-30

- 桌面：`antd.Row gutter [16,16]`（index.jsx:400）；左列内容卡 `xs/sm/md flex 100% → lg 60% → xl 64%`（index.jsx:403，带 `overflowX:'hidden'`），右列时间线 `lg 40% → xl 36%`（index.jsx:408）。
- 官方对照基准是 docs/09 §1.3 表行 1：官方 DOM `--ant-col-xl-flex: 0 0 64% / 0 0 36%`，col padding 8px 即 gutter 16；兼容实现据此修为 64/36+gutter[16,16]，双端 DOM style 串一致（§5 台账 #1）。注意 docs/08 §6（:235）曾记录旧值 xl 70/30，已被该修复取代，**以 docs/09 §1.3 为准**。
- 窄视口（`window.innerWidth < 768`，index.jsx:366/368 的 `useIsCompactViewport`）切换为 Tabs「Approval / Approval process」（index.jsx:380-392），时间线子页有 `paddingTop: token.paddingXS`。
- 弹窗数据契约：apply 面走 `approvals:get`（index.jsx:420，appends=APPLY_POPUP_APPENDS index.jsx:362）；todos 面走 `approvalRecords:get`（index.jsx:486，appends=TODOS_POPUP_APPENDS index.jsx:363）。时间线组件不自行拉数——**v3 portal 复现时须保证 appends 覆盖**：`rounds`、`records(+job/node/user)`、`latestRound(+execution.jobs)`、`workflow.nodes`，否则 collectRounds（approvalTimeline.jsx:781-799）与 nodes 兜底（:805-807）拿不到数据。
- Modal body 横向微溢出（sw>bw，Row 负 margin 所致）为官方同款行为，不修（docs/09 §1.3 表行 5）。

#### 2. 时间线节点类型与 dot 颜色映射——C-15/16/17/25/26

每轮（RoundTimeline，approvalTimeline.jsx:542-778）按序产出四类节点：

| 节点类型 | 触发条件 | dot | 卡内容 |
| --- | --- | --- | --- |
| 提交（Apply） | 每轮必出（:554-592） | `INITIATED_DOT` 绿 + CheckOutlined +「Initiated successfully」（:370） | RoundHeader + 卡 title=t('Apply') + 发起人 UserChip；`createdById===currentUserId` 且 actionEnabled 时挂 `{kind:'application'}`（:564-567） |
| job 节点 | `round.jobs` 逐个（:595-726） | `JOB_STATUS_TO_RECORD[status]` → `RECORD_STATUS_META`（:349-355、:596-597）：0 PENDING 金/ClockCircle、1 APPROVED 绿/Check、-5 REJECTED 红/Close、-6 RETURNED 紫/Rollback、-4 CANCELED 无色/Stop | 卡 title=job.node.title + 协商 pill extra；记录行=UserChip+状态 Tag+时间（APPROVED/REJECTED/RETURNED/DELEGATED 才显 updatedAt，:363-368） |
| 撤回 | `round.status === -4`（:729-745） | WITHDRAWN meta（无色 + UndoOutlined） | 时间 + 卡 title=t('Withdrawn') + 发起人 |
| 终态 | `-1→FAILED(magenta/Exclamation)`、`-3→ABORTED(volcano/Stop)`（:358-361、:748-772） | APPROVAL_STATUS_META | 卡 title=终态标签 + System 用户 + reason（timeout/manual_cancel/parent_aborted 映射，:912-916） |

- StatusDot 实现：antd Tag 改圆形——`borderRadius:'50%'`、20×20、fontSize 10、padding 0、bordered，icon 从 DOT_ICONS 表取（:373-396，12 枚图标 :333-346）；aria-label=编译后 label。
- **dot 正确性依赖服务端写核心 job 状态**（通过=1/否决=-5/退回与废弃=-6）：兼容实现服务端 `onRecordActed`/`returnToNode` 补写（docs/09 §1.3 表行 2、§5 台账 #2）。v3 侧：dot 映射本身 portal-rebuild，服务端写状态行为属 server 面 server-keep，两端契约必须同迁。
- 轮间连接线：`cssTimelineConnector`（:254-260）把末项 tail 保留为虚线并延长 `margin+0.5em+5px`，仅多轮时挂（:775 `index < roundCount-1`）。
- 颜色 META 源在 `models/shared.js`：RECORD_STATUS_LIST :63-74（PENDING 金/RETURNED 紫/APPROVED 绿/REJECTED 红/WITHDRAWN 无色/UNPROCESSED 无色/DELEGATED geekblue/ADDED 无色），APPROVAL_STATUS_LIST :52-61；找不到 status 时 `metaOf` 返回 undefined → dot 退化 PENDING（:596-597 `?? RECORD_STATUS.PENDING`）。

#### 3. 相关审批块（RelatedApprovalsModel）——C-31

- 兼容实现位于 `models/centerBlocks.jsx:253-391`，经 `registerModelLoaders.js:133` 挂载（`extends 'DataBlockModel'`）。
- 数据面：resource=approvals、refreshAction=`listRelated`、pageSize=1、sort=['-createdAt']（centerBlocks.jsx:265-269）；无 `view.inputArgs.filterByTk` 时整个块 hide（:370-373 `define hide`）。
- 配置面：registerFlow `relatedApprovalsSettings.steps.dataScope`（use 'dataScope'），保存参数后 `setPage(1)+refresh`（:375-390）——与 docs/04 §5 条目 45（chunk 16:1167-1196）逐项对应。
- v3 提示：该块消费记录上下文（record/filterByTk），依赖宿主详情容器注入 inputArgs；v3 portal 若无 flow-engine DataBlockModel 形态，需按「approvals:listRelated + 记录上下文过滤」的等价数据块重建。

#### 4. comment 对象感知渲染——C-09

- `commentText`（approvalTimeline.jsx:132-141）：字符串直接 trim；**对象按 text → content → message 字段取值**，全缺则 `JSON.stringify` 兜底；null/undefined 返回空串。时间线引用块（:656、:711-717）与 taskDetailCards 两处 Descriptions（taskDetailCards.jsx:25 从 timeline 复用 commentText）共用此函数。
- 背景：`approvalRecords.comment` 列由 text 迁 jsonb（DB 已 ALTER），退回意见写入 `{"text":"…"}` 形态——不感知对象会显示 `[object Object]`（docs/09 §1.3 表行 3、§5 台账 #3/#4，回归截图 L01）。
- 引用块样式 `cssCommentQuote`（:310-329）：blockquote `paddingXS/paddingSM`、`colorFillTertiary` 底、`borderRadiusSM`、`overflow-wrap:anywhere`、无边框线（border-inline-start:0）。
- v3 提示：服务端集合列类型 jsonb 属 server-keep；任何新端点若直出 comment 原始对象，前端必须走同款取值链。

#### 5. 其他施工注意

- **模型注册面（C-01~C-04）**：四个类均为 flow-engine loader 注册（registerModelLoaders.js），类本体不发起服务端请求，数据来自宿主注入的 `view.inputArgs`（approvals:get 结果）。v3 若保留 flow-engine 宿主可平移；若不保留，需把 defineChildren 的字段展开逻辑（过滤 hidden 名单、默认绑定 fallbackToTargetTitleField、fieldPath 前缀、toggleable 绑 fieldSettings）改写为等价渲染器——能力必须存在，机制形态依 v3 宿主而定。
- **HIDDEN 字段名单**：`APPROVAL_DETAILS_HIDDEN_FIELDS`（shared.js:166）= rounds、latestRound、records、applicantRole、prevRecord、approval、user、createdBy、data、dataAfter——C-03 defineChildren 逐字段过滤（approvalDetailsModels.jsx:47），漏一条即详情区泄漏系统字段。
- **翻译契约**：`useApprovalTranslate` 返回 **t 函数本体**而非 `{t}`（approvalTimeline.jsx:106，taskDetailCards.jsx:11 注释明示「契约见 memory」）；meta label 多为 `{{t("…",{ns})}}` 模板串，必须经 compileTemplate（:110-122）编译后再渲染，直接输出会漏 `{{t(}}` 原文。
- **key 稳定性**：Timeline item key 与卡片 key 均用 stableKey 31 位哈希 base36（:190-195），输入含 approval.id/round.id/job.id/status/时间戳/records——兼容实现时保持同输入集合，否则轮间连接线与 hover 状态在刷新时抖动。
- **委托/加签行**：由 decorateRecordItem（:176-187）按 `type`（官方字符串 'Delegated'/'Added'，:173）+ `prevRecordId` 挂接，渲染为「Delegated to: / Assignees added:」弱化行（:689-709）——records 必须含全量记录（含 prevRecordId/type），appends 只拉本人记录会丢这两类行。
- **未验证项（如实标注）**：本清单全部锚点为静态读码；未运行任何渲染/回归验证（B7 双端一致性结论引自 docs/09 §3 B7，非本次会话复测）。docs/12 元素注册表内容为审批节点配置抽屉（A4 面），与本面无对应表号，故本清单无 docs/12 引用。

---

## 6. 面 D · 表单模型（发起/处理/评论）

> 本表锚点省略公共前缀 `plugin-workflow-approval/src/client-v2/models/`（见下方源文件清单）。
> 官方证据仅引用既有取证（docs/04 §7 chunk 828/§5/§11、docs/09 §6.2/§8、docs/12 表 #6-7、docs/10 E2E），未重做；chunk 828 内 docs/04 未逐行展开的组件按头注释移植声明标「兼容实现自实现」并注明依据（patternFormModels.jsx:1-11 自述 "ported 1:1 from official chunk 828 (webpack module 1695)"）。

### 源文件清单

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `plugin-workflow-approval/src/client-v2/models/patternFormModels.jsx` | 2457 | 本面主文件：PatternForm* 九模型 + ApplyForm* 五动作 + ProcessFormModel 五动作 + CommentForm* 三模型 + ApprovalActionModel 基类 + 共享 flow/工具设施（官方 chunk 828 / 模块 1695 的 1:1 移植，头注释 :1-11） |
| `plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js` | 165 | 表单面 23 个模型名注册进 flowEngine（本面仅引用 :97-122） |
| `plugin-workflow-approval/src/client-v2/models/shared.js` | 285 | 状态枚举（APPROVAL/RECORD_STATUS 与 META）、RETURN_NODE_OPTIONS、`MZ` t 模板、`HIDE_APPLY_FORM_DELETE_ACTION` 契约常量 |

消费端（注册面接线，不在本面文件内但引用行号）：`plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js:97-122`。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | 表单模型族引擎注册（ensureApprovalModelLoaders 注册本面 23 个模型名：9 个 Pattern*（Block/Grid/Item/DetailsItem/Field/SubTableColumn/SubTableField/DisplaySubTableField/AssociationFieldGroup，extends 对应官方基类）+ ApplyFormModel(extends PatternFormBlockModel) 与 Submit/SaveDraft/Withdraw/Delete(extends ActionModel) + ProcessFormModel + CommentFormModel/Grid/Item + Approve/Reject/Return/Delegate/AddAssignee 五动作；syncLoad 同步 loader，引擎级 GUARD 去重） | registerModelLoaders.js:97-122 | 宿主注册面 | docs/04:284-286（§5 items 15-32 官方模型注册清单） | portal-rebuild |
| 2 | 发起人视角 pattern 映射表（APPROVAL_PATTERN_MAP 常量：DRAFT(0)/RETURNED(1)→'edit'，PROCESSING/SUBMITTED/APPROVED/REJECTED/FAILED/ABORTED 六态→'details'） | patternFormModels.jsx:44-53 | 纯前端 | docs/04:411-414（chunk 828:804-828 双映射表） | portal-rebuild |
| 3 | 审批人视角 pattern 映射表（RECORD_PATTERN_MAP：DRAFT/PROCESSING/SUBMITTED→'edit'，RETURNED/REJECTED/APPROVED/FAILED/ABORTED→'details'） | patternFormModels.jsx:54-63 | 纯前端 | docs/04:411-414（chunk 828:804-828） | portal-rebuild |
| 4 | 发起表单 pattern 状态机入口（ApplyFormModel.getPattern=APPROVAL_PATTERN_MAP[Number(approval.status)]‖'createNew'；define 默认 stepParams patternSettings.pattern='createNew'） | patternFormModels.jsx:2279-2282（define :2317-2324） | 纯前端 | docs/04:411-414 + :521（状态机总述 createNew→SUBMITTED→edit/details，DRAFT/RETURNED 可重走） | portal-rebuild |
| 5 | 处理表单 pattern 状态机入口（ProcessFormModel.getPattern：approvalRecordData 含 status 键→isRecordPending(status)?'edit':'details'；否则 RECORD_PATTERN_MAP‖'createNew'——record.status 优先于 approval.status） | patternFormModels.jsx:2335-2342 | 纯前端 | docs/04:411-414（有 record.status：非终态→edit） | portal-rebuild |
| 6 | details 模式父链判定（isDetailsPattern 沿 model.parent 向上，逐级取 getPattern()（异常吞掉）‖patternSettings.pattern，首个命中==='details' 即真；供字段级模型运行时切 Display 族） | patternFormModels.jsx:175-193 | 纯前端 | docs/04:284（Pattern* 族清单）；判定细节兼容实现自实现 | portal-rebuild |
| 7 | 表单取数策略内核（normalizeFormRecordStrategy：editable=pattern==='edit'；terminated=APPROVAL_STATUS_META[status].terminated；reload=editable‖recordShowMode‖associationShowMode；非编辑且非 recordShow 时 fields=compact(collection.filterTargetKey)；reload 时 appends=compact(workflowConfig.appends)——触发器 appends 直通 resource；filterByTk 按 baseValues→approval.data→filterFallbackValues 依次 collection.getFilterByTK 兜底；shouldReload=!workflowConfig.mode && !terminated && filterByTk!=null && reload） | patternFormModels.jsx:526-557（isTerminatedStatus :521-524） | 宿主注册面（产出 SingleRecordResource 的 fields/appends/filterByTk 请求参数） | docs/04:415-417（getFormRecordStrategy 5586-5633 Snapshot vs Latest）；fields/appends/filterByTk 参数化兼容实现自实现 | portal-rebuild |
| 8 | 发起表单快照策略（ApplyFormModel.getWorkflowConfig=flowContext.workflow.config ∪ nodeConfig 浅合并；getFormRecordStrategy baseValues=recordShowMode&&status!=null ? approval.data‖latestRound.snapshot‖{} : latestRound.snapshot‖{}） | patternFormModels.jsx:2284-2300 | 纯前端 | docs/04:415-417（Latest=approval.data / Snapshot=snapshot） | portal-rebuild |
| 9 | 处理表单快照策略（ProcessFormModel.getFormRecordStrategy：merged=approvalExecution.snapshot ∪ dataBefore ∪ dataAfter 层叠覆盖（后者胜）；baseValues=(recordShowMode&&approval.data)‖merged；filterFallbackValues=[dataAfter,dataBefore,snapshot] 供 #7 filterByTk 兜底） | patternFormModels.jsx:2348-2368 | 纯前端 | docs/04:415-417（Snapshot=snapshot∪record.dataBefore∪record.dataAfter，dataAfter→dataBefore→snapshot 回退） | portal-rebuild |
| 10 | resource 参数装载与表单同步族（configureResourceByStrategy set/remove filterByTk+fields+appends；bindResourceRefresh 监听 resource 'refresh'→hasLoadedLatestRecord=true+syncFormWithResourceData（baseValues∪resource.getData→syncResolvedCurrentRecord+form.setFieldsValue）；applyRefreshMode 置 isManualRefresh=!shouldReload；onMount 重装参数且 shouldReload&&hasLoadedLatestRecord 时补同步；getCurrentRecord 读 resolvedCurrentRecord‖baseValues） | patternFormModels.jsx:592-625、:665-677 | 纯前端（数据由宿主 resource get 通道拉取） | 兼容实现自实现（官方 chunk 828 对应段未逐行取证；语义对齐 docs/04:415-417） | portal-rebuild |
| 11 | 块初始化集合回填（onInit：resourceSettings.init 缺 dataSourceKey/collectionName 时 resolveCollectionFromView 从 inputArgs.approval.collectionName‖flowContext.workflow.config.collection 解析（`<ds>.<rest>` 拆 dataSourceKey，无前缀→main）并 setStepParams 回填；patternSettings.pattern 落步骤参数；getCollectionSafely 仅 init 完整时返回 context.collection（异常吞掉）） | patternFormModels.jsx:627-643、:511-519、:580-590 | 纯前端 | 兼容实现自实现（inputArgs 契约参照 docs/04:281、:306） | portal-rebuild |
| 12 | 表单块资源创建与 ACL 映射（createResource：SingleRecordResource，isNewRecord=pattern==='createNew'，绑刷新+非 isNewRecord 装载策略参数；getAclActionName details→'view' / edit→'update' / 其余→'create'） | patternFormModels.jsx:645-663 | 纯前端（action 名供宿主 ACL 校验） | 兼容实现自实现 | portal-rebuild |
| 13 | 表单块渲染与动作工具条（renderComponent=FormComponent(layoutProps: colon/labelAlign/labelWidth/labelWrap/layout)+grid FlowModelRenderer(showFlowSettings:false)+DndProvider 包 antd.Space 动作条；runtime 仅渲染 isRuntimeVisible 为真的动作，flowSettingsEnabled 配置态或 inputArgs.isWorkflowFormConfigMode 全渲染并套 Droppable；构造器注入 actionFlowSettings{showBackground:false,showBorder:false,toolbarPosition:'above'}+DragHandler extraToolbarItems(sort:1)+_defaultCustomModelClasses FormItemModel→PatternFormItemModel；基类 renderConfigureActions 返回 null） | patternFormModels.jsx:559-572、:679-717（define :720-726 hide:true+grid=PatternFormGridModel） | 纯前端 | docs/04:283-284（chunk 828 模块总述）+兼容实现自实现 | portal-rebuild |
| 14 | 配置态字段添加按钮（PatternFormGridModel.renderAddSubModelButton 仅 flowSettingsEnabled 渲染：AddSubModelButton(subModelKey='items'，基类 PatternFormItemModel/PatternFormAssociationFieldGroupModel/FormCustomItemModel/FormJSFieldItemModel，keepDropdownOpen)+SettingOutlined 'Fields' 按钮；define hide:true） | patternFormModels.jsx:469-491 | 宿主注册面 | docs/04:274（chunk 427 Process form 挂 PatternFormGridModel）、:298（chunk 984 Apply form 同款） | portal-rebuild |
| 15 | Pattern 模型缺注册兜底（ensurePatternModelClasses：7 个 Pattern* 类不在 engine.getModelClass 时批量 engine.registerModels；PatternFormBlockModel 构造器 :566 调用） | patternFormModels.jsx:494-509、:566 | 宿主注册面 | docs/04:284（官方 chunk 828 helper 语义） | portal-rebuild |
| 16 | 表单字段模型绑定解析（PatternFormFieldModel extends FieldModel：static resolveUse 读 stepParams.fieldBinding.use‖descriptor.use 名；isDetailsPattern(parent) 时改走 resolveDisplayBindingUse 并 stop；onInit 删除空 props.titleField） | patternFormModels.jsx:232-246 | 纯前端 | docs/04:284 | portal-rebuild |
| 17 | details 展示绑定解析（resolveDisplayBindingUse：子表绑定（PatternSubTableFieldModel/SubTableFieldModel）→PatternDisplaySubTableFieldModel；否则 DetailsItemModel.getDefaultBindingByField(ctx,collectionField,{fallbackToTargetTitleField:true}) 且引擎已注册该模型则采用；兜底映射 CascadeSelect/CascadeSelectList/Input/RecordPicker/RecordSelect/Textarea→DisplayTextFieldModel、SubForm→DisplaySubItemFieldModel、SubFormList→DisplaySubListFieldModel） | patternFormModels.jsx:200-230 | 纯前端 | docs/04:284；映射表兼容实现自实现（chunk 828 resolveUse 移植） | portal-rebuild |
| 18 | details 展示项 label/showLabel 透传（PatternDetailsItemModel extends DetailsItemModel：onInit 清 ITEM_PROP_KEYS（name/rules/required/initialValue/disabled/pattern :248）；getPatternFormShowLabel 取 editItemSettings.showLabel、getPatternFormLabel=editItemSettings.label‖props.label、翻译 ns=lm-flow-engine compareWith 集合字段 title；renderItem cloneElement 注入 label/showLabel） | patternFormModels.jsx:248、:250-291 | 纯前端 | docs/04:284；细节兼容实现自实现 | portal-rebuild |
| 19 | 编辑项 details 化（PatternFormItemModel extends FormItemModel：renderItem 把子渲染器替换为 DisplayFieldRenderer 并透传 titleField；static getBindingsByField 将 SubTableFieldModel 绑定替换为 PatternSubTableFieldModel；defineChildren 包装子工厂走 wrapDescriptorFactory；static resolveUse details→PatternDetailsItemModel） | patternFormModels.jsx:293-330 | 纯前端 | docs/04:284 | portal-rebuild |
| 20 | 子表列模型（PatternSubTableColumnModel：defineChildren 异步包装——field 子模型统一 use=PatternFormFieldModel+fieldBinding.use=原绑定名；resolveUse details→TableColumnModel，否则 SubTableColumnModel；SubTableAddColumnButton=AddSubModelButton(columns、基类 PatternSubTableColumnModel、keepDropdownOpen)+SettingOutlined 'Fields'；define label 'Table column' icon TableColumn createModelOptions sort 0） | patternFormModels.jsx:332-388 | 纯前端 | docs/04:284 | portal-rebuild |
| 21 | 子表字段父禁用级联（PatternSubTableFieldModel.getColumns：props.disabled 时对每列 createFork({disabled:true,__displayFieldRefreshKey:'…pattern-sub-table-parent-disabled:1'})（register:false，fork.createFork 重定向回原模型）实现只读穿透；addColumn 列 title 渲染 SubTableAddColumnButton；mapSubModels 临时替换 finally 还原） | patternFormModels.jsx:390-432 | 纯前端 | docs/04:284；fork 机制兼容实现自实现 | portal-rebuild |
| 22 | details 子表基列（PatternDisplaySubTableFieldModel.getBaseColumns：mapSubModels columns→getColumnProps() 并过滤 hidden） | patternFormModels.jsx:434-442 | 纯前端 | docs/04:284 | portal-rebuild |
| 23 | 关联字段组（PatternFormAssociationFieldGroupModel：defineChildren 递归 migrateTree（函数/Promise 工厂与数组树统一包装 createModelOptions）；itemModelName='FormAssociationItemModel'；define 'Display association fields'） | patternFormModels.jsx:444-467 | 纯前端 | docs/04:284 | portal-rebuild |
| 24 | 旧版描述符迁移层（migrateModelDescriptor 递归改写：use FormItemModel→PatternFormItemModel；associationPathName 命中→FormAssociationItemModel（fieldPath 并入 fieldSettings.init）；subModels.field 归一 use=PatternFormFieldModel+fieldBinding.use（绑定名 SubTableFieldModel→PatternSubTableFieldModel，绑定名从 fieldBinding.use/detailItemSettings.model/editItemSettings.model 多级兜底推断）；wrapDescriptorFactory 包装 createModelOptions 工厂（含 Promise 返回）；PatternFormBlockModel 构造 :561 与 _createSubModels :570-572 双入口迁移） | patternFormModels.jsx:65-172、:560-572 | 纯前端（兼容层） | docs/04:284-286（官方注册名全为 Pattern*——迁移目标态）；迁移规则兼容实现自实现 | tbd |
| 25 | 发起表单默认选项与配置态动作菜单（ApplyFormModel.renderConfigureActions 仅 flowSettingsEnabled：AddSubModelButton actions=[Save draft/Withdraw/Delete 三 toggleable 项]+'Actions' SettingOutlined 按钮；define 默认 use=ApplyFormModel+pattern createNew+grid PatternFormGridModel+actions=[ApplyFormSubmitModel]） | patternFormModels.jsx:2302-2324 | 宿主注册面 | docs/04:364（默认 createModelOptions actions[Submit]）、:298（chunk 984 Form→Apply form 菜单） | portal-rebuild |
| 26 | 共享动作 flow 基座（validateActionForm：blockModel.form.validateFields 必调、stepParams skipRequiredValidation.skipValidator===true 可跳过、options.skipInFlowSettings 时配置态跳过；skipRequiredValidationStep='Skip required validation' switch(skipValidator)；confirmStep：validate 失败→exit，否则 modal.confirm(title/content ns=lm-flow-engine, okText Confirm/cancelText Cancel)取消即 exit；assignFieldValuesStep=clientV2.createAssignFieldValuesStep(settingsFlowKey='clickSettings', title 'Assign field values')+getAssignFieldValuesDefaultParams） | patternFormModels.jsx:967-1014 | 纯前端 | docs/04:349-350（ts 确认弹窗、en 工厂固定步骤序 confirm→skipRequiredValidation→(assignFieldValues)→saveResource） | portal-rebuild |
| 27 | Submit 动作（ApplyFormSubmitModel defaultProps primary；isRuntimeVisible=super（record 无 status‖status===PENDING）&&applyCanAct（无 inputArgs‖isActorAllowed 本人/无主 && approval∈{DRAFT,RETURNED}）；registerFlow applyClickFlow(SUBMITTED)） | patternFormModels.jsx:2086-2094（applyCanAct :866-874） | approvals:update / approvals:create | docs/04:352-363（§7.1）+docs/10:64（T2 草稿→提交 E2E 对齐） | portal-rebuild |
| 28 | Save draft 动作（ApplyFormSaveDraftModel；同一 applyClickFlow(DRAFT)，confirm 文案切 'Perform the Save draft'；官方默认 hide:true，配置态经 #25 菜单开启才显示） | patternFormModels.jsx:2096-2104、:1039-1044 | approvals:update / approvals:create（status=DRAFT(0)） | docs/04:354（submit→SUBMITTED(2)/draft→DRAFT(0)）+docs/10:80、:97（F2b：官方默认隐藏、可配置） | portal-rebuild |
| 29 | 发起/再提交保存链（applyClickFlow.saveResource handler：isEditableApproval 守卫→'Only draft or returned approvals can be resubmitted.'；validateActionForm→formValues(getFieldsValue(true))+resolveAssignValues（clientV2.resolveAssignFieldValues，失败 ctx.exit）→mergeAssignFieldValues 合并→collectionName=workflow.config.collection‖approval.collectionName‖`<ds>:<name>`（workflowCollectionOf :954-965）；有 approval.id→approvals:update{filterByTk,updateAssociationValues,values:{collectionName,data,status}}；否则校验 workflowId 后 approvals:create{updateAssociationValues,values:{collectionName,data,status,workflowId}}→'Submitted successfully'→view.close+inputArgs.refresh；异常 console.error+'Submitted failed'） | patternFormModels.jsx:1032-1091（handler :1047-1088） | approvals:update / approvals:create | docs/04:354-363（§7.1 saveResource 全表）、§11 :499-500 | portal-rebuild |
| 30 | Withdraw 撤回动作（可见性：isActorAllowed 本人 && workflow.config.withdrawable===true && approval.status===SUBMITTED；confirm 'Are you sure you want to withdraw it?'→resolveAssignValues 有值时 values={data:assigned}→approvals:withdraw{filterByTk:approvalId}→markApprovalsDirty→'Withdrawn successfully'+close+refresh，失败 'Withdrawn failed'；配置模式契约：save 时 onNodeConfigChange 同步 nodeConfig.withdrawable=true，destroy 先同步 false 再 destroyPersistedModel（flowEngine.destroyModel‖removeModelWithSubModels），destroy 失败回滚 restoreWithdrawableAfterDestroyFailure；persistenceQueue 串行化防并发写） | patternFormModels.jsx:2106-2224（类 :2106-2187、flow :2189-2224） | approvals:withdraw + flow_nodes:update（仅配置模式同步） | docs/04:366-370（§7.1 tw 全表）、§11 :501 +docs/10:65（T3 撤回 E2E 对齐） | portal-rebuild |
| 31 | Delete 删除动作（可见性：inputArgs 无 HIDE_APPLY_FORM_DELETE_ACTION 旗标（本仓只读不写，契约位 patternFormModels.jsx:2233）&&本人&&approval.id 存在&&status∈{DRAFT,RETURNED}；confirm 'Are you sure you want to delete this approval? This action cannot be undone.'→approvals:destroy{filterByTk}→'Deleted successfully'+close+refresh，失败 'Delete failed'） | patternFormModels.jsx:2226-2274 | approvals:destroy | docs/04:365、§11 :502 | portal-rebuild |
| 32 | 处理表单容器与配置态动作菜单（ProcessFormModel extends PatternFormBlockModel；renderConfigureActions：运行态渲染 ApprovalRecordInfo（#38），配置态 AddSubModelButton actions=[Approve/Reject/Return/Delegate/Add assignee 五 toggleable，afterSubModelAdd/Remove 挂同步回调]+'Actions' 按钮；define：resourceSettings.init{}+pattern createNew+grid PatternFormGridModel；模块 default export） | patternFormModels.jsx:2334-2457 | 宿主注册面 | docs/04:409-420（§7.4）、:274（chunk 427 Approval blocks→Process form）、:420（模块 9738 默认选项） | portal-rebuild |
| 33 | 动作↔节点配置同步（PROCESS_ACTION_STATUS 映射：Approve→APPROVED(2)/Reject→REJECTED(-1)/Return→RETURNED(1)/Delegate→DELEGATED(8)/Add assignee→ADDED(99)；syncProcessActionToNodeConfig 对 config.actions 去重增删后 persistNodeConfig 写回；onMount 挂 emitter onSubModelAdded/onSubModelRemoved，onUnmount 解绑） | patternFormModels.jsx:2326-2332、:2370-2417 | flow_nodes:update | docs/04:418（su 枚举映射+config.actions 同步+onSubModelAdded/Removed） | portal-rebuild |
| 34 | 动作基类可见性状态机（ApprovalActionModel extends ActionModel：defaultProps {title:'Action',type:'default'}；onClick 在 isWorkflowFormConfigMode 时 preventDefault+stopPropagation（配置模式禁触发）；isRuntimeVisible=approvalRecordData 无 status 键‖status===PENDING(0)；render 运行时（非 flowSettingsEnabled 且非表单配置模式）且不可见返回 null） | patternFormModels.jsx:2005-2035（hasStatus/isRecordPending :841-847） | 纯前端 | docs/09:248-257（§6.2 任务弹窗控件清单：撤回·删除/通过·拒绝·退回·委派·加签）+兼容实现自实现 | portal-rebuild |
| 35 | Approve 通过动作（ProcessFormApproveModel primary；afterAddAsSubModel→afterAddEnsureComment 预建评论模型并存 saveResource.commentModelUid（:2039-2042）；registerFlow processClickFlow('Approve',APPROVED(2),'submit')） | patternFormModels.jsx:2039-2052 | approvalRecords:submit（status=2） | docs/04:374-375（registerFlow 清单）+§7.2 :372-391 | portal-rebuild |
| 36 | Reject 拒绝动作（ProcessFormRejectModel danger；同 #35 结构，status=REJECTED(-1)、mode='submit'） | patternFormModels.jsx:2054-2062 | approvalRecords:submit（status=-1） | docs/04:376、§11 :503 | portal-rebuild |
| 37 | Return 退回动作与退回范围配置面（ProcessFormReturnModel，mode='return'；saveResource 步骤：defaultParams 由节点 config.returnTo 推 approvalReturnNodeSettings（-1→ANY/正数→COUNT{count}/字符串→SPECIFIC{target}/缺省 START）；uiSchema 追加 type Select（RETURN_NODE_OPTIONS 四枚举，无可用上游仅 START）+target Select（仅 SPECIFIC 可见）+count InputNumber(min1)（仅 COUNT 可见）联动；afterParamsSave 先 saveCommentModel 再 persistNodeConfig 写 returnToNodeVariable=null 并映射 returnTo（ANY→-1/COUNT→Number(count‖1)/SPECIFIC→target 且 returnToNodeVariable={{​$jobsMapByNodeKey.<target>}}/START→null）） | patternFormModels.jsx:2064-2072、:1300-1390 | flow_nodes:update | docs/04:378-382（approvalReturnNodeSettings/uiSchema 联动/afterParamsSave 映射） | portal-rebuild |
| 38 | 审批提交链运行时（processClickFlow.saveResource.handler：validateActionForm(skipInFlowSettings)→recordIdOf（缺失 'Record not found' :931-938）→loadOrCreateModel 评论模型（缺则 createModelAsync）+addDelegate+flowSettingsEnabled=false→上游选项 approvalNodeOptions(availableUpstreams 过滤 type==='approval')，缺则 walkUpstreamApprovalNodes 遍历 upstream 链（:1138-1149）→return 时 returnNodesFor 展开（-1→全部上游+发起人{value:0,label:t('Applicant (restart)')}；正数 N→最近 N 个不足补发起人；字符串→指定节点）注入 extraContent=returnToNodeKey 必填 Select（单选项 disabled，useLayoutEffect 归一默认值 :1095-1121）→actionDialog（Modal.confirm 宽 520、zIndex=popupBase+1000、FlowModelRenderer 渲染评论表单 :1227-1245）→onOk：validateFields→commentValues{comment,returnToNodeKey}+主表单 formValues(getFieldsValue(false))→approvalRecords:submit‖return {filterByTk:recordId,updateAssociationValues,appends,values:{…commentValues,status,data}}→return 后 markApprovalsDirty→resetFields+view.close+inputArgs.refresh；失败 'Submitted failed' 并重抛） | patternFormModels.jsx:1291-1471（handler :1391-1467） | approvalRecords:submit / approvalRecords:return | docs/04:383-390（handler 步骤 1-5）、§11 :503-504 +docs/10:66、:71（T4 退回重提/T9 退回指定节点 E2E 对齐） | portal-rebuild |
| 39 | Delegate 转交动作（ProcessFormDelegateModel；reassignClickFlow('Delegate','delegate','toDelegate')；配置面 saveResource 'Assignees scope'（uiMode 宽 700）：defaultParams 读 config.toDelegateReassignees（元素 filter 组或字符串变量）+toDelegateReassigneesOptions.extraFieldKey，uiSchema=AssigneesScopeEditor，afterParamsSave persistNodeConfig 写回（非 filter 对象统一 {filter} 包装）；运行时 actionDialog+ReassignForm 单选 assignee） | patternFormModels.jsx:2074-2078、:1544-1641 | approvalRecords:delegate + flow_nodes:update（配置面） | docs/04:393-407（§7.3 tf 全表）、§11 :505 | portal-rebuild |
| 40 | Add assignee 加签动作与候选人取数（ProcessFormAddAssigneeModel；type='toAdd'；ReassignForm：候选人 approvalRecords.reassignees/<recordId>:list {type,pageSize:200,filter nickname‖username $includes}（useRequest 防抖 300ms、ready=recordId、refreshDeps 四元）；assignee 必填 Select（toAdd 多选/delegate 单选，showSearch 服务端过滤 filterOption:false）；order 字段仅 action==='add'&&nodeConfig.order 显示（negotiation 缺省禁用），Radio Before Me(-1)/After Me(1)；候选 label=nickname‖username‖email‖id+extraFieldKey antd.Tag；onOk→approvalRecords:add{filterByTk,values:{assignee,order?}}） | patternFormModels.jsx:2080-2084、:1473-1542 | approvalRecords.reassignees:list / approvalRecords:add | docs/04:403-406（tc 表单+候选人 API+防抖）、§11 :487、:506 +docs/12 表 #6-7（Select users/Query users 官方形态同构） | portal-rebuild |
| 41 | 评论表单模型族（commentFormModelOptions 工厂：uid‖uid()+use=CommentFormModel+grid CommentFormGridModel+默认 items=[MarkdownItemModel(editMarkdown=t("This operation can not be revocated. Please confirm before submitting.",ns))]；CommentFormModel.render→CommentFormRenderer（antd useForm 注入 context.form，layoutProps 缺省 vertical，extraContent 槽）；CommentFormGridModel 配置态 'Fields' 按钮内置默认 Comment 项（fieldSettings.init{dataSourceKey:'main',collectionName:'approvalRecords',fieldPath:'comment'}+TextareaFieldModel autoSize{minRows:4,maxRows:10}）；CommentFormItemModel onInit setProps name=fieldPath、beforeRender 事件解除 hidden） | patternFormModels.jsx:730-837 | 宿主注册面 | docs/04:383（评论表单=CommentFormModel）、:391（commentModelUid） | portal-rebuild |
| 42 | 评论模型基建（ensureCommentModelUid：动作 afterAdd 时 loadOrCreateModel(commentFormModelOptions(),{delegate}) 并 setStepParams saveResource.commentModelUid；运行时 #38 handler 按 uid 复建（loadOrCreate skipSave=!flowSettingsEnabled→createModelAsync 兜底）+addDelegate+flowSettingsEnabled=false；CommentModelPreview 配置态预览（loadOrCreate+onChange(uid)+Spin 占位）；commentModelUiSchema={commentModelUid:{type:'string',x-component:CommentModelPreview}}；saveCommentModel 取 engine.getModel(uid).save() 持久化） | patternFormModels.jsx:1247-1288、:1400-1414 | 宿主注册面（评论子模型 loadOrCreate/save 走引擎模型持久化） | docs/04:383、:391（eH uiSchema）、:306（chunk 828 `x` 通用 uid 渲染器 loadModel 语义） | portal-rebuild |
| 43 | 转交/加签作用域编辑器（AssigneesScopeEditor 受控值 {assignees[],extraFieldKey}：行两态——字符串（''/​{{…}}→AssigneeVariableInput：flowEngine.VariableInput 包装，metaTree=Constant+$env/$context/$system（workflowClient.useWorkflowVariableOptions‖inputArgs.workflowVariableOptions），{{ctx.*}}↔paths 互转 :1657-1712）或 filter 组→AssigneesFilterPanel（users 集合）；行操作=上移/下移/删除（aria-label+ArrowUp/ArrowDown/Delete 图标，绝对定位行右上）；Add 虚线按钮 Dropdown[Select users→追加 undefined 占位/Query users→追加空 $and 组]；空态虚线框 'No assignees yet, please add one.'；尾部 extraFieldKey Select（id/username/email，label 取 users 字段 title）'Show extra field in search list'） | patternFormModels.jsx:1807-2001（变量设施 :1645-1673） | 纯前端（值经 #39/#40 的 afterParamsSave 持久化） | docs/04:395-396（tn 编辑器：行编辑三态+extraFieldKey）+docs/12 表 #6-7 | portal-rebuild |
| 44 | 查询用户条件组面板（AssigneesFilterPanel：优先委托宿主 workflowClient.FilterDynamicComponent（collection 缺省 users，官方全量变量树）；宿主缺导出时兜底自拼——observable FilterGroup 状态+reaction(toJS JSON 序列化)回传 onChange、FilterItem=VariableFilterItem(rightAsVariable+全量 meta)、临时 FlowModel 注入 collection 上下文；同文件导出 defaultFilterGroup/isFilterGroup/cloneFilterGroup/isUserFilterItem 供行归一（{$and:[…]} 编译组与 {} 均按原样保留防丢值 :1927-1935）） | patternFormModels.jsx:1714-1804 | 纯前端 | docs/09:284-292（§8 第八轮：FilterDynamicComponent 委托修复+「节点数据」变量树铁证） | portal-rebuild |
| 45 | 数据层通用设施（approvalsResource/recordsResource 访问器 api.resource('approvals' 或 'approvalRecords')[action]，缺失抛 'approvals:<action> is required'；markApprovalsDirty：engine.markDataSourceDirty('main',…)+DATA_SOURCE_DIRTY_EVENT 广播 approvals+approvalRecords 双资源；persistNodeConfig：inputArgs.node.id 存在时 update(config)→同步 inputArgs.nodeConfig/node.config+onNodeConfigChange→flow_nodes:update{filterByTk,values:{config}}；recordIdOf 缺失报 'Record not found'；workflowCollectionOf collectionName 三级来源；userLabel nickname‖username‖name、userTag antd.Tag） | patternFormModels.jsx:858-938、:949-965、:1016-1028 | 宿主注册面（通用入口，具体 action 见 #27-#40 各行） | docs/04:347-348（eZ/eK 访问器、eY 节点配置持久化）；markApprovalsDirty 兼容实现自实现 | portal-rebuild |

### 施工提示

**24 个类一口气清点（先读）**：本文件 = `PatternFormBlockModel / PatternFormGridModel / PatternFormItemModel / PatternDetailsItemModel / PatternFormFieldModel / PatternSubTableColumnModel / PatternSubTableFieldModel / PatternDisplaySubTableFieldModel / PatternFormAssociationFieldGroupModel`（9 个字段/布局族，:232-509）+ `ApplyFormModel / ApplyFormSubmitModel / ApplyFormSaveDraftModel / ApplyFormWithdrawModel / ApplyFormDeleteModel`（:2086-2324）+ `ProcessFormModel / ProcessFormApproveModel / ProcessFormRejectModel / ProcessFormReturnModel / ProcessFormDelegateModel / ProcessFormAddAssigneeModel`（:2039-2457）+ `CommentFormModel / CommentFormGridModel / CommentFormItemModel`（:730-837）+ 基类 `ApprovalActionModel`（:2005-2035）。23 个名字注册在 registerModelLoaders.js:97-122（ApplyFormModel extends PatternFormBlockModel，其余动作 extends ActionModel）。v3 复现按「块模型→网格→字段族→动作族→评论族」五层建。

**pattern 状态机（整面的分叉根）**：
- 三个入口：ApplyFormModel.getPattern（:2279，APPROVAL_PATTERN_MAP[approval.status]‖createNew）、ProcessFormModel.getPattern（:2335，approvalRecordData.status 键优先：PENDING(0)→edit 否则 details；无 record 走 RECORD_PATTERN_MAP）、块基类默认 createNew（:574-576，onInit :636 落 patternSettings 步骤参数）。
- 语义链（docs/04:521）：createNew→(approvals:create)→SUBMITTED→审批人视角 edit→details(终态)；DRAFT/RETURNED 重走 edit→submit。
- 字段级消费：isDetailsPattern（:175）沿父链判定后，PatternFormItemModel→PatternDetailsItemModel（:324-327）、PatternFormFieldModel→Display 绑定（:241-243）、PatternSubTableColumnModel→TableColumnModel（:369-372）三处运行时切换。

**字段来源（触发器 appends）**：appends 不在本文件硬编码，全部来自 `workflowConfig.appends`——ApplyFormModel 的 workflowConfig=workflow.config ∪ nodeConfig 浅合并（:2284-2287），ProcessFormModel 只取 workflow.config（:2344-2346）。装载规则（:526-557）：仅 `reload=editable‖recordShowMode‖associationShowMode` 时 appends=compact(appends) 进 resource（configureResourceByStrategy :623）；纯 details 快照态不挂 appends，fields 收敛为 collection.filterTargetKey。shouldReload 还需 `!mode && !terminated && filterByTk!=null`（:554）——workflow mode（会签/或签计数）存在时不自动刷新，改手动（isManualRefresh）。

**快照渲染（Snapshot vs Latest）**：ApplyForm baseValues=recordShowMode 时 `approval.data‖latestRound.snapshot`，否则 `latestRound.snapshot`（:2295-2298）；ProcessForm merged=`snapshot ∪ dataBefore ∪ dataAfter`（dataAfter 最上层），recordShowMode&&approval.data 优先（:2353-2358）。渲染管线：baseValues 先经 syncResolvedCurrentRecord 进 resource（:641/:655），resource 'refresh' 事件回来后 `baseValues ∪ resource.data` → form.setFieldsValue（:608-615）——即快照打底、最新数据覆盖。filterByTk 兜底链 [baseValues→approval.data→filterFallbackValues(dataAfter→dataBefore→snapshot)] 依次 collection.getFilterByTK（:535-545）。

**草稿/提交写链（谁调什么）**：
- Submit/SaveDraft 共用 applyClickFlow(status)：有 approval.id→`approvals:update`，无→`approvals:create`（必须带 workflowId）；status 参数即 SUBMITTED(2)/DRAFT(0)。守卫：只有 DRAFT/RETURNED 可再写（:1055-1058）。
- Withdraw：仅本人+config.withdrawable===true+SUBMITTED（:2179-2186）；调用 `approvals:withdraw`；配置模式下 save/destroy 会同步 nodeConfig.withdrawable 并在 destroy 失败时回滚（:2121-2177）——v3 若保留「配置态勾选撤回」交互需复刻该双向同步。
- Delete：仅 DRAFT/RETURNED+本人+有 id，且受 `inputArgs[HIDE_APPLY_FORM_DELETE_ACTION]` 旗标抑制（:2233；该旗标本仓只读不写，是宿主契约位）。
- 审批人：Approve/Reject→`approvalRecords:submit`（status 2/-1），Return→`approvalRecords:return`（status 1+returnToNodeKey），Delegate/Add→`approvalRecords:delegate`/`approvalRecords:add`。写后统一 markApprovalsDirty 广播双资源脏事件（:907-913）。

**校验链**：主表单校验集中在 validateActionForm（:967-974，blockModel.form.validateFields；flowSettingsEnabled 可 skipInFlowSettings）；`skipRequiredValidation` 步骤（switch skipValidator）可逐动作关闭（:976-983）；confirmStep 先校验后弹确认、取消即 ctx.exit（:985-1006）。评论弹窗 onOk 独立 validateFields（:1439）；ReassignForm assignee 必填+order 条件必填（:1514、:1532）。表单块 ACL 名随 pattern 映射 details→view/edit→update/create（:660-663）。

**配置态契约**：所有配置面入口以 `context.flowSettingsEnabled` 门控（:471、:780、:2303、:2420）；节点配置写回统一 persistNodeConfig→`flow_nodes:update {filterByTk, values:{config}}`（:1016-1028），涉及 config.actions（:2401）、config.returnTo/returnToNodeVariable（:1371-1389）、config.toAddReassignees/toDelegateReassignees(+Options.extraFieldKey)（:1579-1589）。`inputArgs.isWorkflowFormConfigMode` 是第三种模式（工作流抽屉内嵌配置）：动作禁点击（:2009-2014）、块工具条全渲染（:687）。

**评论模型机制**：评论不是独立弹窗表单，而是持久化的 CommentFormModel 子模型——动作 afterAdd 时预建并存 `saveResource.commentModelUid`（:1247-1253），运行时按 uid loadOrCreateModel 复建（skipSave=!flowSettingsEnabled）并 delegate 主块上下文（:1400-1414）；默认内容是免撤销警示 Markdown（:743-745），默认字段 approvalRecords.comment 的 Textarea（:788-799）。v3 需等价的 loadOrCreateModel/save/destroyModel 持久化通道。

**宿主能力依赖（v3 需等价提供）**：flow-engine 的 SingleRecordResource/createResource、loadOrCreateModel/createModelAsync/destroyModel、DndProvider/Droppable/AddSubModelButton/FlowSettingsButton/VariableInput、DATA_SOURCE_DIRTY_EVENT；client-v2 的 FormItemModel/DetailsItemModel/SubTable* 基类族、DetailsItemModel.getDefaultBindingByField、resolveAssignFieldValues/mergeAssignFieldValues/createAssignFieldValuesStep；workflow-client 的 useWorkflowVariableOptions、FilterDynamicComponent（#44 有自拼兜底，但兜底会丢「节点数据」变量组，v3 应直接复刻宿主组件）、resolveDisplayBindingUse 所需模型注册。

**不确定/未取证（如实登记）**：① ApprovalRecordInfo（#38 引用的 eU 组件，patternFormModels.jsx:1155-1216）在 docs/04 §7 未逐行展开，官方字段清单以移植实现为准；② resolveDisplayBindingUse 兜底映射表、PatternSubTableFieldModel 的 fork 禁用机制、configureResourceByStrategy 参数化均为「头注释声明 1:1 移植但 docs/04 未展开」的兼容实现自实现项；③ `HIDE_APPLY_FORM_DELETE_ACTION` 的宿主写入方不在本仓 client-v2 内（repo-wide grep 仅 patternFormModels.jsx:2233 读、shared.js:88 定义），v3 契约需向宿主方确认。

**v3Action 说明**：本面 45 条全部为 v2 客户端界面能力/注册面 → portal-rebuild；唯一 tbd 是 #24 旧版描述符迁移层——是否保留取决于 v3 持久化数据是否含官方 v1/v2 遗留描述符（FormItemModel 旧名、associationPathName 平铺结构），全新数据源可省，混合数据源必须保留。无 server-keep 项（本文件不含服务端行为；各行 API 列为消费的服务端 action，服务端实现归属其他面）。

---

## 7. 面 E · 配置面板（触发器/节点/画布/通知组）

> 本表锚点省略公共前缀 `plugin-workflow-approval/src/client-v2/`（三个源文件两个目录，见源文件清单）。行号均为本会话实读行号。
> 官方证据仅引用既有取证（docs/04 §chunk 483/617/931 + §chunk 344/984、docs/08 §4/§9/§10.3/步骤 5–10、docs/12 全表），未重做；兼容实现自有实现标「兼容实现自实现」。
> 本面所有功能点均为 v2 客户端界面能力，v3 判定一律 portal-rebuild；表单值经宿主 workflow 客户端表单提交落库（workflows:update / flow_nodes:update 属宿主脚手架，不在本面锚点内）。

### 源文件清单

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `plugin-workflow-approval/src/client-v2/fieldsets.jsx` | 901 | 触发器/节点配置面板全字段集（预设/正式/测试三套）+ 审批人分组编辑器 + 画布分支组件 + 「谁可以发起」受众弹窗 + 界面设计器入口按钮（官方 chunk 483/617 复刻） |
| `plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx` | 520 | 审批通知组 fieldset（Form.List 行=禁用渠道+模板类型+模板字段+删除；custom 弹窗编辑器；todo/done 双变量集 LY/N5；官方 chunk-931 module 1242/9785 复刻） |
| `plugin-workflow-approval/src/client-v2/models/triggerPageModels.jsx` | 116 | 发起界面搭建器页模型三件套（TriggerChildPageModel/TabModel + TriggerBlockGridModel 的 Add block 菜单；官方 chunk 344 module 4907 + chunk 984 module 9395 的 1:1 移植） |

消费端：`fieldsets.jsx:176-219` 的 TriggerInterfaceButton 委托 `models/interfaceConfig.jsx`（:144 triggerPageModelOptions / :177 applyTaskCardModelOptions / :418 InterfaceConfigButton / :615 NodeInterfaceConfigButton，本面不重复登记 interfaceConfig 内部）。

### 施工提示

1. **触发器面板（fieldsets.jsx:316-464）控件全清单与门控**：hidden `config.collection`（必填）/hidden `config.withdrawable`（:327-332，真实写入点在发起界面设计器，经 `workflows:update` 同步）→ 数据表只读展示（:333）→ `mode` 触发方式（:335-343，1=保存前带 Tooltip「数据在审批通过后才会保存」/0=保存后）→ `centralized` 发起位置（:344-355，false=仅数据区块/true=区块+待办中心）→ `audienceType`（:356-360， initialValue 1）→ `usageInstructions` **仅 centralized=true 出现**（:361-371）→ `approvalUid`/`taskCardUid` 设计器入口 **仅 collection 非空出现**（:372-397）→ `recordShowMode` 快照/最新（:398-409）→ `appends` 预加载关联（:410-418）→ hidden `associationShowMode`（:421，官方此处另有「关联加载模式已弃用」Alert+Migrate 一键置 false，兼容实现只保留隐藏键未复刻迁移警告，见 docs/04:171）→ `useSameTaskTitle` Checkbox **门控** `taskTitle` 变量输入（:422-438，初值取 wf.triggerTitle‖wf.title）→ 自动通过双 Checkbox `autoPassIfApprovedInRound`+`autoPassIfApplicant`（:439-456）→ done 通知组（:457-462）。
2. **节点面板（fieldsets.jsx:711-830）控件全清单与门控**：hidden `config.actions`（:723，动作枚举由画布动作子模型经 flow_nodes:update 写入，实现侧此键只透传）→ `branchMode` 通过模式 **disabled:true 灰禁**（:724-733，创建后不可改；docs/12 表行4 官方灰禁实证）→ `assignees` 必填（:734-750，validator=数组 filter(Boolean) 非空；分组编辑器见 4）→ `negotiation`（:751-755）→ `order` 并行/依次（:756-765）→ `forceManualApproval` **门控=wf.config.autoPassIfApprovedInRound‖autoPassIfApplicant 任一开启**（:717 判定、:766-778 渲染）→ `endOnReject` **门控=branchMode===true**（:716 判定、:779-788 渲染，docs/12 表行10 官方 useWatch 铁证）→ `approvalUid`/`taskCardUid` **门控=collection 非空**，无集合时 Alert「请先在触发器中配置数据表」（:789-808）→ `title` 任务标题 **useSameTaskTitle 时 disabled** 并提示沿用触发器（:809-822）→ todo 通知组（:823-828）。
3. **审批人（assignees）两种添加模式**（fieldsets.jsx:637-709）：Add 虚线按钮 Popover 两项——「选择用户」追加**空字符串占位**（渲染 CC 抄送同款 UserSelect，require 失败回落宿主 UsersSelect，:38-44、:632-634）；「查询用户」追加 **defaultUserFilterGroup() 条件组**（:702-703）。行值三态渲染（:606-635）：数字/空→用户选择；`{{...}}`→变量输入；object→FilterPanel 条件面板（**onChange 回写编译格式 `{$and:[...]}`/空组 `{}`，不能走 String() 分支否则显示 [object Object]，docs/08 §10.3 已修**）。行结构=拖拽柄（rows≥2 才可拖）+值+删除（:556-604）；users 集合从 flow-engine 全局实例取（节点抽屉在 FlowContext 之外，:557-561）。数字字符串 update 时转回 Number（:650）。dnd-kit 用普通 flex div 而非 antd Space（alpha.9 antd 5.6 的 item 包装不吃 flex:1，:563-564 注释）。
4. **画布分支结构**（fieldsets.jsx:834-891）：`branchMode` 为假→仅 NodeDefaultView；为真→在 NodeDefaultView 子树内渲染 branchBlock 三泳道 `[-1,2,1]`=拒绝(红 Tag)/通过(绿)/退回(紫)（:872-886）；每泳道 Branch 的 entry 按 `upstreamId===data.id && branchIndex===i` 查找；**end 终止符**：退回泳道恒有、拒绝泳道仅 `config.endOnReject` 时有（:884）——泳道内「+」加节点按钮由宿主 workflow 核心按 versionStats.executed 控制（docs/08:103-107），非本面职责。点卡任意处开配置的代理点击（:846-853）：排除 input/textarea/button/a/.anticon/[role=button] 后代点卡内第一个 `.ant-tag,.ant-btn`（官方 alpha.10 行为，alpha.9 宿主只挂类型 chip）。
5. **通知组**：节点=**todo 组**（变量集 LY）、触发器=**done 组**（变量集 N5），同一 `config.notifications` 数组键、同一组件双挂载（fieldsets.jsx:457-462/:823-828 + notificationsFieldset.jsx:397-514）。行=渠道 Select（**disabled**，flex 0 0 12em）+ templateType Select（template/custom，**切换即清空 template**，:467）+ 模板字段 + 删除；列表下「添加渠道」Select 只列未用渠道，选中即 add({channel, templateType:'template'})（:491-503）。custom→「配置模板」弹窗（in-app→InAppTemplateFields 五字段 title/content/options.url/options.mobileUrl/options.duration(默认5)；非 in-app→notification-manager ContentConfigForm）。宿主兼容坑：antd 5.6 无 Flex/Space.Compact/ConfigProvider.useConfig（一律 div+样式、可选链兜底）；RemoteSelect 取自 `@nocobase/client-v2` 而非 workflow 包（:13-20），缺则 PlainTemplateSelect 兜底。
6. **docs/12 已登记缺口**：**F16**（docs/12:35，低危视觉）——官方协商/顺序/通过模式每个选项带 `?` 帮助图标（宿主 RadioWithTooltip 组件行为），兼容实现用裸 Tooltip 包 Radio 无图标 affordance；修法 Tooltip 内加 QuestionCircleOutlined 后缀，修前先核对官方 bundle 图标组件与位置。涉及本表 #21/#25/#26。**T14**（docs/12:22 转引）——投票阈值输入框的官方形态未取证（兼容实现为 `>` InputNumber 1-99%，存储 v/100 默认 0.5）。兼容实现对官方的**已知语义偏差**（v3 复现需决策）：①受众保存兼容实现用 `approvalAudiences:destroy`+`create` 批量，官方为 `approvalAudiences:replace` 整体替换（docs/04:515）；②官方受众弹窗按 approvalAudienceTypes 注册表渲染 Tabs（缺省 role Transfer，docs/04:188-192），兼容实现为 users 多选 Select；③associationShowMode 迁移警告未复刻（见 1）。
7. **既有字段集门控复现优先级**：三处门控是官方 wire 铁证过的（branchMode→endOnReject、autoPass→forceManualApproval、useSameTaskTitle→taskTitle/节点 title disabled、centralized→usageInstructions、collection→界面入口与通知前置），v3 portal 必须同款条件渲染，勿做成常显。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | 直连 API 通道（api()：Bearer NOCOBASE_TOKEN + X-Data-Source: main 头；GET/POST `/api/<action>`；params 值 JSON 序列化；错误取 errors[0].message） | fieldsets.jsx:62-84 | 通用通道（供本面各数据面消费） | 兼容实现自实现 | portal-rebuild |
| 2 | 集合字段加载（useCollectionFields：collections:get{filterByTk,appends:[fields]}；滤除 SYSTEM_FIELDS 七键与 interface=password；产出 label/value 选项） | fieldsets.jsx:99-121 | collections:get | 兼容实现自实现 | portal-rebuild |
| 3 | 审批人用户搜索（useUserOptions：users:list pageSize50，250ms 防抖，filter=nickname/username $includes；label=nickname‖username） | fieldsets.jsx:123-138 | users:list | 兼容实现自实现 | portal-rebuild |
| 4 | 触发器预设字段集（新建工作流抽屉：config.collection 必填，CollectionCascader 控件） | fieldsets.jsx:142-148 | 宿主注册面 | docs/04:156（chunk 483:1416-1427） | portal-rebuild |
| 5 | 数据表只读展示（CollectionDisplay：文本 `数据源 / 集合标题`，collections:get filterByTk 取 title，失败回落源/名；真值藏 hidden input，与 hidden withdrawable 同区） | fieldsets.jsx:152-171（hidden :327-333） | collections:get | docs/04:161-162（chunk 483:1303-1376、1515-1519）；docs/08:110-114 | portal-rebuild |
| 6 | 触发方式单选（config.mode：1=数据保存前[Tooltip 审批通过后才保存]/0=数据保存后[Tooltip 先保存再走流程]，initialValue 0，每项 Tooltip 包裹） | fieldsets.jsx:335-343 | 宿主注册面 | docs/04:163（chunk 483:1525-1560） | portal-rebuild |
| 7 | 发起位置单选（config.centralized：false=仅数据区块[业务数据 Tooltip]/true=区块+待办中心[行政数据 Tooltip]，纵向排列） | fieldsets.jsx:344-355 | 宿主注册面 | docs/04:164（chunk 483:1561-1598） | portal-rebuild |
| 8 | 使用说明（config.usageInstructions：centralized=true 才出现；TextArea placeholder 点击发起审批，autoSize 3-8 行，extra=文字将显示在待办中心审批列表） | fieldsets.jsx:361-371 | 宿主注册面 | docs/04:166（chunk 483:1608-1623） | portal-rebuild |
| 9 | 谁可以发起（config.audienceType：Radio 1=所有用户/0=仅选择的用户；选 0 显已选计数+选择按钮；Modal 40% 宽多选用户（搜索防抖 #3），未保存工作流时 Modal 内警告 Alert；保存=先 destroy 全部再按 draft 批量 create{type:'users',targetKey,workflowId}——官方为 approvalAudiences:replace 且按 audienceTypes 注册表渲染 Tabs，兼容实现有语义偏差） | fieldsets.jsx:356-360 + 227-312（load :235-241、submit :247-258） | approvalAudiences:list / approvalAudiences:destroy / approvalAudiences:create | docs/04:165、188-192、447、514-515（chunk 483:232-660，官方 replace chunk 483:337） | portal-rebuild |
| 10 | 发起界面设计器入口（config.approvalUid，collection 非空才渲染；TriggerInterfaceButton primary+SettingOutlined；approvalUid 分支注入 collection 上下文（dataSourceManager.getCollection），createModelOptions=triggerPageModelOptions(uid)（TriggerChildPageModel 树），uidPrefix approval_，legacyFieldName applyForm 接 v1 迁移；uid 生成 makeUid 前缀随机） | fieldsets.jsx:376-386 + 179-218（makeUid :86-88） | 宿主注册面（flowModels 桥；v1 迁移 uiSchemas:remove/workflows:update 在 interfaceConfig） | docs/04:167、178-187（chunk 483:1629-1646、O :181-189 对照官方 O） | portal-rebuild |
| 11 | 我的申请卡片设计器入口（config.taskCardUid，CreditCardOutlined 图标；configureModel 注入 workflow 标题+workflow/dataDataSourceKey/dataCollectionName 上下文；createModelOptions=applyTaskCardModelOptions(uid, wf.title)（ApplyTaskCardDetailsModel+GridModel，approvals 集合 horizontal 布局）） | fieldsets.jsx:387-397（上下文注入 :190-201） | 宿主注册面 | docs/04:168、185-186（chunk 483:1647-1664、b/v :1445-1502） | portal-rebuild |
| 12 | 流程中记录显示方式（config.recordShowMode：false=快照[各方看到进入时快照 Tooltip]/true=最新[始终最新 Tooltip]，initialValue false） | fieldsets.jsx:398-409 | 宿主注册面 | docs/04:169（chunk 483:1665-1694） | portal-rebuild |
| 13 | 预加载关联（config.appends：AppendsSelect(collection)，extra=超两级一对多性能警示） | fieldsets.jsx:410-418 | 宿主注册面 | docs/04:170（chunk 483:1695-1706） | portal-rebuild |
| 14 | associationShowMode 隐藏保留键（官方此处有「关联数据加载模式已弃用」Alert+Migrate 一键置 false，兼容实现仅 hidden Input 保留键、迁移警告未复刻——v3 复现需决策是否补） | fieldsets.jsx:421 | 宿主注册面 | docs/04:171（chunk 483:1709-1733） | portal-rebuild |
| 15 | 统一任务标题开关与门控（config.useSameTaskTitle Checkbox（valuePropName=checked）门控 config.taskTitle=VariableInput（:432-438，initialValue=wf.triggerTitle‖wf.title）；extra=勾选后全节点同标题） | fieldsets.jsx:422-438 | 宿主注册面 | docs/04:172-173（chunk 483:1734-1760） | portal-rebuild |
| 16 | 自动通过双开关（config.autoPassIfApprovedInRound=当前轮次已通过自动通过 + config.autoPassIfApplicant=审批人是申请人自动通过，两个 noStyle Checkbox 共用「自动通过」label；同时是节点 forceManualApproval 的显隐门控源） | fieldsets.jsx:439-456 | 宿主注册面 | docs/04:174-175（chunk 483:1761-1787） | portal-rebuild |
| 17 | 触发器 done 通知组挂载（config.notifications=NotificationList type=DONE + useDoneTemplateVariables，即「审批完成时通知申请人」组；组件本体见 #34-#40） | fieldsets.jsx:457-462 | notificationChannels:list / approvalMsgTpls:list（经 #34/#35） | docs/04:176、452（chunk 483:1788-1792；chunk 931） | portal-rebuild |
| 18 | 触发器测试运行字段集（手动执行弹窗：data=TriggerCollectionRecordSelect 必填（宿主组件，选记录/主键）；applicantId=RemotePick users（nickname/id）必填；applicantRoleName=RemotePick roles（title/name）选填；RemotePick=泛化 `${resource}:list` pageSize200 全量选项+前端过滤） | fieldsets.jsx:484-504（RemotePick :468-482） | users:list / roles:list + 宿主注册面（TriggerCollectionRecordSelect） | docs/08:123-131（步骤 10，chunk 483 测试 fieldset）；docs/04:5（chunk 483 头注） | portal-rebuild |
| 19 | 节点预设字段集（新建节点抽屉：config.branchMode 必填单选 直通模式(false)/分支模式(true)，initialValue false；决定画布形态与 endOnReject 门控） | fieldsets.jsx:508-519 | 宿主注册面 | docs/04:215（chunk 617:1795-1821）；docs/08:73-83 | portal-rebuild |
| 20 | 节点隐藏 actions 键（hidden config.actions Input，保存动作枚举；实现侧仅透传，动作同步由界面搭建器动作子模型经 flow_nodes:update 完成） | fieldsets.jsx:723 | 宿主注册面 | docs/04:220（chunk 617:1869-1873） | portal-rebuild |
| 21 | 通过模式灰禁单选（config.branchMode Radio.Group disabled:true 创建后不可改：直通=拒绝/退回即终止 Tooltip、分支=按结果走分支 Tooltip；官方灰禁已实证） | fieldsets.jsx:724-733 | 宿主注册面 | docs/04:221（chunk 617:1874-1907）；docs/12:18 表行4（F16 `?` 图标缺口） | portal-rebuild |
| 22 | 审批人必填与分组编辑器（config.assignees required validator=数组 filter(Boolean) 非空；AssigneesInput：值数组=多组审批人（固定用户串/变量/filter 组），dnd-kit DndContext+SortableContext verticalListSortingStrategy 拖拽排序（rows<2 禁拖），update 数字串转 Number，remove/add（Popover：选择用户→`''`、查询用户→defaultUserFilterGroup()）） | fieldsets.jsx:734-750 + 637-709 | 宿主注册面 | docs/04:222、235-241（chunk 617 Y:1350-1407/J:1408-1467）；docs/08:98-108；docs/12:19-21 表行5-7 | portal-rebuild |
| 23 | 审批人行组件（AssigneeRow：HolderOutlined 拖拽柄（aria 排序审批人，sortDisabled 不可拖）+flex:1 值区+删除按钮（aria 移除审批人）；普通 flex div 非 antd Space（alpha.9 兼容）；users 集合经 flow-engine 全局实例取（抽屉在 FlowContext 外）） | fieldsets.jsx:556-604（flowEngine 取集合 :557-561） | 宿主注册面 | docs/04:241（chunk 617 行 J）；docs/12:20 表行6 | portal-rebuild |
| 24 | 审批人值三态渲染（renderAssigneeValue：`{{` 开头字符串→AssigneeVariableInput 变量输入；object（编译格式 `{}`/`{$and}` 或编辑器 `{logic,items}`）→AssigneesFilterPanel 条件面板（object 一律进面板，toFilterGroup 反编译兜底，修 [object Object] 回归）；数字/空→CC UserSelect（notification-manager UserSelect，缺包回落 UsersSelect）） | fieldsets.jsx:606-635 | 宿主注册面（用户候选经 #3/#23） | docs/08:387-408（§10.3 三态判定与双格式修复）；docs/04:241；docs/12:21 表行7 | portal-rebuild |
| 25 | 协商模式（config.negotiation=NegotiationRadio initialValue 0：或签 0/会签 1/投票小数三选，每项 Tooltip 语义文案（NEGOTIATION_TIPS）；投票选中出 `>` InputNumber 1-99%，值存 v/100、默认 0.5；disabled 透传） | fieldsets.jsx:521-554 + 751-755 | 宿主注册面 | docs/04:223、243-（chunk 617 Z:1627-1726）；docs/12:22 表行8（F16 缺口+T14 投票阈值官方形态未取证） | portal-rebuild |
| 26 | 顺序单选（config.order：false=并行[任意顺序 Tooltip]/true=依次[顺序审批 Tooltip]，initialValue false） | fieldsets.jsx:756-765 | 宿主注册面 | docs/04:224（chunk 617:2064-2093）；docs/12:23 表行9（F16） | portal-rebuild |
| 27 | 禁用自动通过（config.forceManualApproval Checkbox「禁用自动通过」，**仅当触发器开启任一 autoPass**（wf.config.autoPassIfApprovedInRound‖autoPassIfApplicant，:717 判定）才渲染；extra=勾选后该节点不自动通过） | fieldsets.jsx:766-778（门控 :717） | 宿主注册面 | docs/04:225（chunk 617:2094-2107）；docs/12:30（门控与官方 chunk617:1452-1455 一致） | portal-rebuild |
| 28 | 拒绝分支结束流程（config.endOnReject Checkbox「拒绝分支结束后结束流程」，**仅 branchMode=true 渲染**（:716 useWatch 判定，docs/12 官方 chunk617:1289/1456-1459 useWatch 铁证）；同时驱动画布拒绝泳道 end 终止符 #32） | fieldsets.jsx:779-788（门控 :716） | 宿主注册面 | docs/04:226（chunk 617:2108-2124）；docs/12:24 表行10 | portal-rebuild |
| 29 | 节点审批界面/我的审批卡片入口（config.approvalUid=NodeInterfaceButton(prefix approval_)、config.taskCardUid=NodeInterfaceButton(prefix task_card_) 带 extra；collection 为空时整组替换为 Alert「请先在触发器中配置数据表」；NodeInterfaceButton 直通宿主 NodeInterfaceConfigButton 流 model uid 桥） | fieldsets.jsx:789-808 + 221-223 | 宿主注册面（flowModels 桥） | docs/04:227-228、232（chunk 617 M:755-975）；docs/12:25-26 表行11-12 | portal-rebuild |
| 30 | 节点任务标题（config.title=VariableInput，initialValue=node.title；外层 extra 按 useSameTaskTitle 二态：沿用触发器/默认节点标题；**useSameTaskTitle 时 disabled**） | fieldsets.jsx:809-822 | 宿主注册面 | docs/04:229（chunk 617:2160-2177）；docs/12:27 表行13 | portal-rebuild |
| 31 | 节点 todo 通知组挂载（config.notifications=NotificationList type=TODO + useTodoTemplateVariables，即「待办分配时通知审批人」组，变量集 LY） | fieldsets.jsx:823-828 | notificationChannels:list / approvalMsgTpls:list（经 #34/#35） | docs/04:230、452（chunk 617:2178-2182；chunk 931） | portal-rebuild |
| 32 | 画布审批节点分支结构（ApprovalCanvasComponent：非 branchMode→NodeDefaultView；branchMode→子树渲染 branchBlock 三泳道 [-1 拒绝红/2 通过绿/1 退回紫]（BRANCH_META :834-838），每泳道 Branch{from,entry=upstreamId+branchIndex 匹配,controller=彩色 Tag,end=退回恒终止/拒绝按 endOnReject}；整个卡 onClickCapture 代理开配置） | fieldsets.jsx:834-891 | 宿主注册面（instruction.canvas 组件注册） | docs/04:233（ApprovalCanvasComponent）；docs/08:84-88（步骤 6 三泳道+退回终止符对照） | portal-rebuild |
| 33 | 点卡任意处开配置代理点击（onCardClick：排除 input:not(disabled):not(readonly)/textarea/button/a/.anticon/[role=button] 目标后代点击卡内第一个 .ant-tag,.ant-btn 代为触发；官方 alpha.10 行为，alpha.9 宿主只挂类型 chip——兼容实现对双宿主形态的兼容层） | fieldsets.jsx:846-853 | 纯前端 | 官方行为取证见 fieldsets.jsx:844-845 注释（alpha.10 wire）；docs/12:15 表行1（宿主 scaffold 登记口径） | portal-rebuild |
| 34 | 通知组 Form.List 主体（NotificationList：组标签 Todo/Done notifications+组说明（NOTIFICATION_META :54-63）；行=渠道 Select（**disabled**，aria Notification channel，flex 0 0 12em，选项 notificationChannels:list pageSize200）+templateType Select（Template/Custom，**切换清空 template**）+TemplateField+删除按钮（aria Delete，componentDisabled 联动）；列表下「添加渠道」Select（placeholder，options=未用渠道，选中 add{channel,templateType:'template'}，空则禁用）） | notificationsFieldset.jsx:397-514（渠道拉取 :405-417、行渲染 :447-490、添加 :491-503） | notificationChannels:list | docs/04:452、490（chunk 931:2060-2302、2105）；docs/08:282-312（§9 行结构 1:1 + 双端实测） | portal-rebuild |
| 35 | 通知模板字段（TemplateField：channel 缺省返回 null；templateType=custom→ConfigureTemplateButton（validator=template 非空）；=template→RemoteSelect（`@nocobase/client-v2` 导出，request=approvalMsgTpls:list{pageSize:200,filter:{notificationType,type}}，label=title‖id，ready=notificationType 就绪）；宿主缺 RemoteSelect→PlainTemplateSelect 自拉兜底） | notificationsFieldset.jsx:300-358 | approvalMsgTpls:list | docs/04:452（chunk 931 模板 RemoteSelect 契约）；docs/08:282-312 | portal-rebuild |
| 36 | 配置模板弹窗（ConfigureTemplateButton：Configure template link 按钮+Modal 40% 宽（Submit/Cancel，destroyOnClose，打开回填 template）；in-app-message 或无 nmClient→InAppTemplateFields，否则 notification-manager ContentConfigForm(channelType,namePrefix=['template'])） | notificationsFieldset.jsx:260-297 | 宿主注册面（非 in-app 渠道编辑器由 notification-manager client-v2 提供） | docs/04:452（custom 编辑器）；docs/08:282-312（§9 Custom 编辑器与官方同构） | portal-rebuild |
| 37 | 站内信自定义模板字段（InAppTemplateFields：title=Message title（TemplateVariableInput）必填、content=Message content（TemplateContentInput，autoSize 8 行，`{{{ }}}` 定界，placeholder 'Hi,'）必填、options.url=桌面详情页（内链 `/` 外链 `http` extra）、options.mobileUrl=移动端（`/m` extra）、options.duration=Close after InputNumber（单位秒，空=不自动关，默认 5）） | notificationsFieldset.jsx:215-257 | 宿主注册面 | docs/04:452（官方 N 五字段）；docs/08:282-312 | portal-rebuild |
| 38 | 变量插入输入组（TemplateVariableInput：Input+FlowContextSelector（'x' 衬线斜体按钮），选变量在**光标处**插入 `{{path}}` 并恢复焦点（insertAtCaret :76-81）；TemplateContentInput：TextArea 变体，delimiters 可定制（content 用 `{{{ }}}`）；componentDisabled 联动禁用） | notificationsFieldset.jsx:121-212 | 纯前端（FlowContextSelector 取自宿主 flow-engine） | 官方 M/I 移植（notificationsFieldset.jsx:120、170 注释）；docs/08:300（变量树/交互同构实测） | portal-rebuild |
| 39 | 通知变量树整形（useNotificationMetaTree：approval 组——todo 保留 APPROVAL_KEY_ORDER 六键且组名改「当前审批记录」，done 把其余非保留变量并入子级组名 Approval；RESERVED_ROOTS 六键过滤；$context/$system 重挂为 Trigger/System variables 组；按 name 去重） | notificationsFieldset.jsx:83-118 | 纯前端 | 官方 N() 移植（notificationsFieldset.jsx:84、97 注释）；docs/08:312（剩余差异：变量树合并按官方语义简化，已登记） | portal-rebuild |
| 40 | todo/done 变量集（useTodoTemplateVariables=LY：applicant.nickname + approval[workflowTitle/approvalId/dataKey/nodeTitle/approvalRecordTitle/approvalRecordId] 六键；useDoneTemplateVariables=N5：statusText + approval[workflowTitle/approvalId/dataKey] 三键；再并宿主 useWorkflowVariableOptions） | notificationsFieldset.jsx:360-394（合并 :418-422） | 纯前端 | docs/04:452（chunk 931:2646+ LY/N5） | portal-rebuild |
| 41 | 发起界面子页面模型（TriggerChildPageModel extends ChildPageModel：onInit 注入 context.disableFieldClickToOpen=true——字段点击不弹详情，服务表单搭建态） | triggerPageModels.jsx:39-44 | 宿主注册面 | docs/04:296（chunk 344:329 item 42）；docs/08:177（chunk 344+984 移植表） | portal-rebuild |
| 42 | 页签模型与网格懒加载（TriggerChildPageTabModel.renderChildren→ChildGridLoader：engine.loadOrCreateModel({parentId,subKey:'grid',async,subType:'object',use:'TriggerBlockGridModel'},{skipSave:!flowSettingsEnabled})+跨父 addDelegate；渲染 FlowModelRenderer/未就绪 SkeletonFallback（移动 margin 8）） | triggerPageModels.jsx:17-61 | 宿主注册面（flowModels load/save 通道） | docs/04:296；docs/08:177 | portal-rebuild |
| 43 | Add block 网格菜单（TriggerBlockGridModel extends BlockGridModel：仅 flowSettingsEnabled 渲染 AddSubModelButton（含 FlowSettingsButton +Plus）；Form 组→Apply form（ApplyFormModel：resourceSettings.init{dataSourceKey,collectionName}+pattern createNew+grid=PatternFormGridModel+actions=[ApplyFormSubmitModel]）；Other blocks 组→Markdown/JS block；类 define(hide:true) 不进通用加块菜单） | triggerPageModels.jsx:63-116 | 宿主注册面 | docs/04:298（chunk 984:104-150 item 44）；docs/08:177、194-215（§4 验证 1-3） | portal-rebuild |

---

**汇总**：43 个功能点（fieldsets.jsx 33 + notificationsFieldset.jsx 7 + triggerPageModels.jsx 3），v3 判定全部 portal-rebuild（无纯 server 行为、无待验证宿主形态项——flow-engine/client-v2 依赖为 npm 库依赖，v3 portal 内联承载，与 surface-A 同口径）。
**未核验声明**：官方 chunk 483/617/931/344/984 本会话未重新反汇编，全部对照结论转引 docs/04/docs/08/docs/12 既有取证；本会话实读的只有三个源文件全文与 docs/04 §3-§4/§5/§9/§11、docs/08 §4/§9/§10.3/步骤 6-10、docs/12 全表。

---

## 8. 面 F · 审批人界面配置器

> 本表锚点省略公共前缀 `plugin-workflow-approval/src/client-v2/models/`（见下方源文件清单）。
> 官方证据仅引用既有取证（docs/04 §3.2 chunk 483 组件 A / §4.1 chunk 617 组件 M / §11.3 配置类 API 表、docs/08 §4 配置弹窗链路移植与验证、docs/09 §2 A6-A10 与 D-5、docs/12 表 11/12），未重做；兼容实现自有实现标「兼容实现自实现」。
> 本面覆盖配置弹窗链路全链（触发器侧「发起界面/我的申请卡」+ 节点侧「审批界面/我的审批卡片」），面名沿用任务书「审批人界面配置器」。

### 源文件清单

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `plugin-workflow-approval/src/client-v2/models/interfaceConfig.jsx` | 759 | 配置弹窗链路唯一源文件：弹窗通道/装载器/模型工厂/上下文注入/去配置按钮/v1 遗留迁移（官方 chunk 483 组件 A/I/N/b/V/_ + chunk 617 组件 D/M/P/O/x 的 1:1 移植，头注释 interfaceConfig.jsx:1-10；移植声明 docs/08:188-192） |

依赖（同目录，本文件消费）：`./shared`（NS/`splitCollectionName`/`rootDataSourceManager`，interfaceConfig.jsx:19-24）、`./registerModelLoaders`（`ensureApprovalModelLoaders`，:25）、`./registerCollections`（`registerApprovalCollections`，:33）。

消费端接线（不在本面文件内但引用行号）：`plugin-workflow-approval/src/client-v2/fieldsets.jsx:203-218`（触发器侧包装：`createModelOptions` 按 name 分派两工厂 :209-212、`hideUid:true` :213、`uidPrefix approval_/task_card_` :215、legacy `applyForm`/`workflows` :216-217）；`fieldsets.jsx:221-223`（节点侧直通包装 NodeInterfaceButton）；`fieldsets.jsx:793-808`（节点「审批界面/我的审批卡片」两 Form.Item 行 + 无集合时 Alert 拦截）。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | 审批客户端集合注册入口（ensureApprovalCollections：WeakSet 按 flowEngine 实例去重守卫，调 registerApprovalCollections 挂客户端集合 schema，异常 console.error 不阻断） | interfaceConfig.jsx:27-37 | 宿主注册面 | docs/08:222（§5#3 模块 334 registerCollections 补齐铁证） | tbd |
| 2 | 弹窗打开通道（viewerDialog：优先官方 `flowCtx.viewer.dialog`；缺通道回退 antd.Modal.info 自足外壳，width 800/title/OK 文案兜底） | interfaceConfig.jsx:39-53 | 宿主注册面 | docs/04:180（官方 viewer.dialog，chunk 483:974-1035） | portal-rebuild |
| 3 | 配置弹窗内容装载链（ModelConfigContent：useRequest 内 ensure loaders+collections→preloadModelLoaders；`approval_` 前缀预等 UploadFieldModel；loadOrCreateModel 建/载模型，readOnly 传 `{skipSave:true}`） | interfaceConfig.jsx:60-83 | 宿主注册面（flow-engine loadOrCreateModel；持久化走 flowModels，docs/08:210） | docs/08:188-192 + docs/04:184 | tbd |
| 4 | 模型失配 uid 重建（stored descriptor 的 use 与工厂不符→removeModelWithSubModels 删旧树→`randomId(uidPrefix)` 新 uid→onChange 回写；readOnly 不删不重建不回写） | interfaceConfig.jsx:84-92 | 宿主注册面 | docs/04:180（官方 randomId(prefix) uid 生成） | tbd |
| 5 | 模型类预载（use=ApplyTaskCardDetailsModel 时 Promise.all 等 ItemModel/AssociationFieldGroupModel/TaskCardCommonItemModel 三类；`waitFor` 数组通用预等通道） | interfaceConfig.jsx:94-103 | 宿主注册面（getModelClassAsync） | docs/08:176（chunk 502 ApplyTaskCard 家族行） | tbd |
| 6 | 配置态上下文委托注入（context.addDelegate(viewCtx)；defineProperty view / dataSourceManager / flowSettingsEnabled=!readOnly / disableFieldClickToOpen=true） | interfaceConfig.jsx:104-108 | 宿主注册面（flow-engine context） | docs/04:186（官方上下文注入 v/O） | tbd |
| 7 | 配置器渲染壳（configureModel 回调→onModelReady(uid)→refreshDeps [modelUid,readOnly]；就绪渲染 FlowModelRenderer hideRemoveInSettings+showFlowSettings:false；未就绪 antd.Spin） | interfaceConfig.jsx:109-117 | 宿主注册面（FlowModelRenderer） | docs/08:196-197（弹窗渲染 TriggerChildPageModel 树验证截图） | tbd |
| 8 | 隐藏布尔占位输入（HiddenBooleanInput：input type=hidden 保存 `String(value!==undefined)`，保表单值语义） | interfaceConfig.jsx:121-123 | 纯前端 | 兼容实现自实现（头注释 chunk 483 V；hidden input 形态参照 docs/04:161） | portal-rebuild |
| 9 | 集合显示文本（CollectionDisplay：parseCollectionName 拆 ds/name；三级取集合 collectionManager.getCollection ?? dataSource.getCollection ?? dsm.getCollection；文本=数据源 displayName / 集合 title） | interfaceConfig.jsx:126-141 | 纯前端 | docs/04:161（官方 `_` 组件只读文本「数据源 / 集合」，chunk 483:1303-1376） | portal-rebuild |
| 10 | 触发器「发起界面」默认模型工厂（triggerPageModelOptions：use=TriggerChildPageModel async；props displayTitle:false/enableTabs:false/title="Initiator's interface"({{t ns}})；tabs=[TriggerChildPageTabModel→grid:TriggerBlockGridModel]，tab 标题 Details；stepParams.pageSettings.general 同 props） | interfaceConfig.jsx:144-174 | 宿主注册面 | docs/04:184（官方 N 工厂） | portal-rebuild |
| 11 | 我的申请卡默认模型工厂（applyTaskCardModelOptions：use=ApplyTaskCardDetailsModel；workflowTitle→props/decoratorProps.title；grid=ApplyTaskCardGridModel；resourceSettings.init{dataSourceKey:main,collectionName:approvals}+detailsSettings horizontal） | interfaceConfig.jsx:177-190 | 宿主注册面 | docs/04:185（官方 b 工厂） | portal-rebuild |
| 12 | 任务卡配置上下文回调（configureApplyTaskCardContext：workflowTitle→setProps/setDecoratorProps 双写标题；parseCollectionName 拆 collection→defineProperty workflow/dataDataSourceKey/dataCollectionName；useMemoizedFnFactory 稳定引用） | interfaceConfig.jsx:192-209 | 宿主注册面（flow-engine context） | docs/04:186 | tbd |
| 13 | 节点侧空网格/页签工厂（emptyApprovalGridOptions：use=ApprovalBlockGridModel subModels.items=[]；approvalTabOptions：use=ApprovalChildPageTabModel tab 标题 Details + grid=空网格） | interfaceConfig.jsx:212-222 | 宿主注册面 | docs/08:188-192（chunk 617 O/x 移植声明） | portal-rebuild |
| 14 | 节点侧模型工厂双分支（nodeConfigModelOptions：kind=approval→ApprovalChildPageModel（displayTitle:false/enableTabs:false/title="Approver's interface"；tabs=[approvalTab]；stepParams.pageSettings.general + ApprovalChildPageSettings.init{dataSourceKey,collectionName}=拆分 workflow.config.collection）；else→ApprovalTaskCardDetailsModel（resourceSettings.init{main,approvalRecords}+horizontal；grid=ApprovalTaskCardGridModel）） | interfaceConfig.jsx:225-264 | 宿主注册面 | docs/04:227-228（§4.1 表 Approver's interface / My approvals card 行） | portal-rebuild |
| 15 | 节点侧弹窗装载与 uid 重建（NodeModelConfigContent：同款 ensure+preload+loadOrCreateModel；descriptor.use 不符→删树重建新 uid 并 onChange 回写；readOnly skipSave） | interfaceConfig.jsx:289-303 | 宿主注册面（+flowModels 持久化） | docs/04:180、183（uid 生成/executed 只读锁定） | tbd |
| 16 | tabs/grid 结构修复链（kind=approval 未锁定：tabs[0] 缺→addSubModel('tabs',approvalTabOptions)；grid 缺→findModelByParentId(tab.uid,'grid')→loadModel({parentId,subKey:'grid'})→setSubModel('grid',空网格) 四步兜底） | interfaceConfig.jsx:305-332 | 宿主注册面 | docs/08:188-192（chunk 617 修复逻辑移植声明） | tbd |
| 17 | 触发集合变更同步（拆分 workflow.config.collection 与 ApprovalChildPageSettings.init 比对，不一致→setStepParams(init)+setCollectionCtx+`model.save()`；结构修复过也 save） | interfaceConfig.jsx:334-343 | 宿主注册面（model.save→flowModels:save） | docs/08:179（chunk 143/427 ApprovalChildPageSettings flow 行） | tbd |
| 18 | 节点侧上下文注入与 inputArgs（defineProperty dataSourceManager/flowSettingsEnabled/disableFieldClickToOpen；view.inputArgs：isWorkflowFormConfigMode:true、flowContext{workflow,nodes‖[node]}、approval.collectionName、availableUpstreams、node、nodeConfig、onNodeConfigChange、workflowVariableOptions——搭建器变量树与上游集的唯一来源） | interfaceConfig.jsx:345-361 | 宿主注册面（flow-engine view 通道） | docs/04:180（官方 inputArgs 形状）+ docs/08:188-192 | tbd |
| 19 | taskCard 分支预载与集合上下文（预等三类 Item 模型；model 与 grid 两级 defineProperty collection=main/approvalRecords；workflow/dataDataSourceKey/dataCollectionName 三键） | interfaceConfig.jsx:362-381 | 宿主注册面 | docs/08:180（chunk 733 ApprovalTaskCardDetails 行） | tbd |
| 20 | 节点侧渲染壳与背景设置门控（FlowModelRenderer showFlowSettings=kind==='taskCard' && SHOW_BACKGROUND_SETTINGS{showBackground:false,showBorder:true,showDragHandle:false}；Spin 兜底；refreshDeps 七元组 [modelUid,readOnly,kind,workflow集合,node.key,nodes.length,upstreams.length]） | interfaceConfig.jsx:382-412 | 宿主注册面（FlowModelRenderer） | 兼容实现自实现（SHOW_BACKGROUND_SETTINGS 常量为兼容实现取舍；渲染壳结构 chunk 617 P 见 docs/08:188-192） | tbd |
| 21 | 触发器「去配置」按钮组（uid 展示 span（hideUid 可藏）+SettingOutlined 按钮 aria-label "Go to configure"；executed/versionStats+disabled 三态禁用（editDisabled=executed?disabled:disabled）；configRef 随 workflowId 切换重置） | interfaceConfig.jsx:418-453、593-608 | 宿主注册面 | docs/08:116（触发器面板「发起界面、我的申请卡片」字段行）+ docs/04:183 | portal-rebuild |
| 22 | 触发器弹窗装配（openDialog：deferForLegacy 判定；`uid=value??randomId(prefix)` 无值未锁定即 onChange 预写；inputArgs{flowContext{workflow},isWorkflowFormConfigMode:true,nodeConfig=configRef 快照}；非 taskCard 才注入 header/body(flow-root,var(--nb-box-bg))/content 样式；content→ModelConfigContent 传 defer/onChange/onModelReady/uid/uidPrefix/waitFor） | interfaceConfig.jsx:455-519 | 宿主注册面 | docs/04:180（viewer.dialog+inputArgs 契约） | portal-rebuild |
| 23 | 触发器界面配置回写（inputArgs.onNodeConfigChange：提取 nextConfig.withdrawable 写入表单 config.withdrawable→`workflows:update {filterByTk:workflowId, values:{config}}`→失败回滚表单字段并 rethrow→成功同步 configRef/currentWorkflow.config/inputArgs.nodeConfig 三处） | interfaceConfig.jsx:465-483 | workflows:update | docs/04:181（onNodeConfigChange/workflows:update/withdrawable）+ docs/04:512（API 表） | portal-rebuild |
| 24 | v1 遗留删除·触发器侧（deleteLegacy：`POST uiSchemas:remove/<uid>`→表单/内存 config.applyForm=null→`workflows:update`→nodeFlowCtx.refresh→message success；无遗留或无 workflowId 返回 false 短路） | interfaceConfig.jsx:521-532 | uiSchemas:remove + workflows:update | docs/04:182、517、529（v1→v2 迁移与附录） | portal-rebuild |
| 25 | 迁移确认弹窗（confirmMigrate：Modal.confirm 标题 "Configure new interface"/正文警告不可撤销/okText "Delete and configure new interface"；onOk 先 deleteLegacy 成功才 openDialog；触发器/节点两端各有一份同文案实现） | interfaceConfig.jsx:534-544、697-707 | 纯前端 | docs/04:182（Modal.confirm 文案） | portal-rebuild |
| 26 | 触发器遗留态渲染三分支（legacy 字段双读 useWatch+getFieldValue（仅 approval_ 前缀，:447-450）；①storedLegacy&&executed&&value→uid+按钮 ②storedLegacy→竖排 uid+未执行 warning Alert（"Interfaces created in the legacy version are no longer supported…"）+Dropdown(hover)=[Legacy interface(disabled), Configure new interface(disabled‖executed→confirmMigrate)] ③默认分支 uid+按钮） | interfaceConfig.jsx:447-450、546-592 | 纯前端 | docs/04:182 + docs/04:529（遗留降级） | portal-rebuild |
| 27 | 首配即迁移延迟写入（有遗留且未锁定→deferForLegacy 推迟 uid 预写；模型就绪 onModelReady 才 onChange(新 uid) 并把 legacy 字段置 undefined；触发器/节点两侧同构） | interfaceConfig.jsx:456-458、508-513、651-653、670-675 | 宿主注册面（写工作流/节点 config 表单值） | docs/04:182（迁移语义；延迟写入口径为兼容实现细节） | portal-rebuild |
| 28 | 节点侧「去配置」按钮与 kind 分派（NodeInterfaceConfigButton：kind=prefix.startsWith('task_card')→taskCard/approval；弹窗标题 Approver's interface / My approvals card；executed 锁定同款三态；hideUid 默认 true（D-5 修复）；goButton aria "Go to configure"） | interfaceConfig.jsx:615-631、709-714、743 | 宿主注册面（消费 workflow-client 上下文 hooks） | docs/12:25-26（表 11/12）+ docs/09:227（D-5 已修）+ docs/08:96、269 | portal-rebuild |
| 29 | 节点侧配置回写（writeNodeConfig：`node.config=config` 内存同步 + form.setFieldValue(['config'],config)；经 inputArgs.onNodeConfigChange 传入搭建器，locked 时传 undefined——节点侧不直接打 API，持久化交给宿主抽屉保存与 model.save） | interfaceConfig.jsx:633-636、667 | 宿主注册面（内存/表单同步） | docs/04:232（M 组件装配） | portal-rebuild |
| 30 | 节点侧弹窗装配与双 styles（deferForLegacy 仅 approval kind；`uid=value??randomId(prefix)`；config 取表单或 node.config；styles 分支：approval=header+body(flow-root,var(--nb-box-bg))+content(padding 0)，taskCard=body(padding 0)+content(paddingMD×paddingContentHorizontalLG)；content→NodeModelConfigContent 传 kind/node/nodes/upstreams/workflowVariableOptions/workflow） | interfaceConfig.jsx:638-683 | 宿主注册面 | docs/04:232（M 组件 approval/taskCard 双形态） | portal-rebuild |
| 31 | v1 遗留删除·节点侧（deleteLegacy：`POST uiSchemas:remove/<uid>`→config.applyDetail=null→node.config 同步→`flow_nodes:update {filterByTk:node.id, values:{config}}`→refresh+message success） | interfaceConfig.jsx:685-695 | uiSchemas:remove + flow_nodes:update | docs/04:232（chunk 617:898-937 迁移）+ docs/04:513、517（API 表） | portal-rebuild |
| 32 | 节点侧遗留态渲染分支（仅 kind=approval 有遗留分支：uid+未执行 warning Alert+Dropdown[Legacy interface(disabled)/Configure new interface]；taskCard 与默认分支均只出 uid（hideUid 默认藏）+goButton） | interfaceConfig.jsx:716-742 | 纯前端 | docs/04:182 + docs/04:529 | portal-rebuild |
| 33 | 翻译助手（useFlowTranslator：取 engine.context.t；识别 `{{t("…")}}` 模板串剥壳后以 NS 命名空间翻译；非字符串原样返回——供按钮/标题/确认弹窗文案消费） | interfaceConfig.jsx:746-757 | 纯前端 | 兼容实现自实现（docs/08:234 同族 nsMode fallback 翻译 hook） | portal-rebuild |

### 施工提示

#### 1. uid 建块机制

- uid 生成 = `flowEngine.randomId(prefix)`（interfaceConfig.jsx:89、300、457、652），前缀三族：`approval_`（发起界面/审批界面）、`task_card_`（我的申请卡/我的审批卡片）、`fm_`（节点组件 prop 默认值，:615，实际由 fieldsets.jsx:796/801 传入前两族覆盖）。uid 持久化在 workflow/node config 键 `approvalUid`/`taskCardUid`（v1 为 `applyForm`/`applyDetail`），链路：onChange → antd Form 字段 → 宿主配置面板保存（官方验证 docs/08:204：`approval_xxx` 持久化）。
- 打开弹窗即 `uid = value ?? randomId(prefix)`，无值且未锁定**立即** onChange 预写（:457-458、:652-653）——重开弹窗靠该 uid 从服务端恢复整棵模型树（flowModels:findOne/save，docs/08:210）。
- 失配重建守卫：工厂产物的 `use` 与已存模型不符（模型类改名/结构升级）→ `removeModelWithSubModels` 删旧树→新 uid 重建→onChange 回写（:84-92 触发器侧、:297-303 节点侧；两侧判定式写法不同但语义一致）。v3 复现建议保留。
- readOnly（`executed>0` 或 disabled）→ `loadOrCreateModel(..., {skipSave:true})`，不删不重建不回写 uid（:82、:294）。

#### 2. Details 基类（宿主依赖，v3 最大复用面之一）

- 配置器装载的树全部建在 `@nocobase/plugin-workflow/client-v2` 导出的基类之上：任务卡两族 extends `DetailsBlockModel/DetailsGridModel/DetailsItemModel/DetailsAssociationFieldGroupModel`（applyTaskCardModels.jsx:5-9、approvalTaskCardModels.jsx:6-9），页面族 extends `ChildPageModel/ChildPageTabModel/BlockGridModel`（approvalPageModels.jsx:5-7）。**基类本体不在本面**（页面族已记 surface-A；类移植清单 docs/08:176-184）。
- 本文件对 Details 树的显式操作点：类预载 `getModelClassAsync`（:78-80、:94-103、:362-367）、grid 选择器修复（:313-331）、taskCard 的 model+grid 双级 context 注入（:368-380）。v3 若无 workflow client-v2 基类，这批操作点连同工厂（#10/#11/#13/#14）需整体替换为等价块编辑器——工厂的声明数据可复用，消费路径待验证。

#### 3. 选择器

- **模型树修复链**（节点侧 approval kind，:305-332）：`model.addSubModel('tabs', approvalTabOptions())` → `engine.findModelByParentId(tab.uid,'grid')` → `engine.loadModel({parentId:tab.uid, subKey:'grid'})` → `tab.setSubModel('grid', emptyApprovalGridOptions())`，任一步修复即置 changed，末尾 `model.save()`（:341-343）。四步层层兜底，缺一步即渲染空页签——v3 必须等价实现。
- **遗留字段双读**：`antd.Form.useWatch(['config', applyForm|applyDetail], form)` + `form.getFieldValue` 兜底（:447-450 仅 approval_ 前缀生效；:625-626 节点侧不分前缀）。
- **集合解析三级链**：`dataSource.collectionManager.getCollection ?? dataSource.getCollection ?? dataSourceManager.getCollection(ds,name)`（:129-133）；工作流集合拆分 `splitCollectionName(workflow.config.collection)`（:227、:334、:377）。

#### 4. 与宿主 flow-engine 的耦合点（本清单全部 tbd 项的依据；v3 移植最大不确定面）

- 引擎 hooks：`useFlowEngine/useFlowViewContext/useFlowContext`（:71-72、:286-287、:434、:616）。
- 引擎机制 API：`preloadModelLoaders`、`getModelClassAsync`、`loadOrCreateModel({skipSave})`、`removeModelWithSubModels`、`findModelByParentId`、`loadModel`、`randomId`、`FlowModelRenderer`（:71-117、:289-406）。
- 模型实例 API：`context.addDelegate/defineProperty`、`setProps/setDecoratorProps`、`getStepParams/setStepParams`、`setCollectionCtx`、`addSubModel/setSubModel`、`save`（:104-109、:192-203、:305-343、:345-380）；`save` 走 flowModels:findOne/save 持久化（docs/08:210）。
- 挂载注册面：`ensureApprovalModelLoaders`（45 个 extends+loader 注册项，docs/08:185）、`ensureApprovalCollections`（模块 334 客户端集合 schema，docs/08:222）。**若 v3 宿主无 flow-engine/flowModels 存储，这两面与上列 API 需整体替代方案**——故标 tbd，待 v3 宿主形态验证后回填 portal-rebuild 或替代方案。
- 弹窗通道：`flowCtx.viewer.dialog` 为官方通道，缺通道回退 antd.Modal.info 自足外壳（:39-53）——v3 宿主有 viewer 通道则用之，否则兜底已可复现（#2 因此判 portal-rebuild）。
- workflow-client 上下文 hooks：`useCurrentWorkflowContext/useNodeContext/useFlowContext/useAvailableUpstreams/useWorkflowVariableOptions/parseCollectionName`（:438-439、:620-624、:128、:198）——依赖宿主工作流配置抽屉的上下文供给，v3 portal 需提供等价上下文。

#### 5. 行为不对称与陷阱（复现时易漏）

- **回写不对称**：触发器侧 onNodeConfigChange **直接打** `workflows:update`（withdrawable 须即时落库，:465-483）；节点侧 writeNodeConfig **只同步内存+表单**（:633-636），持久化交给宿主抽屉保存与 model.save。
- **遗留迁移仅 approval kind**：taskCard 无遗留分支（:716）；节点侧 legacy 双读不分前缀、触发器侧仅 approval_ 前缀（:448-450）。
- **首配即迁移**：有遗留且未锁定→deferForLegacy 推迟 uid 预写，模型就绪 onModelReady 才写新 uid 并清 legacy 字段（:456、:508-513、:651、:670-675）——先渲染后迁移，避免半迁移态。
- **refreshDeps 差异**：触发器二元组 [modelUid,readOnly]（:112）；节点七元组（:385-394，workflow 集合/节点/上游变化均触发重装）。
- **showFlowSettings 门控**：仅 taskCard kind 且仅 showBorder:true（:401、:408-412）。
- 节点侧「无触发器集合」的 Alert 拦截在宿主 fieldsets 层（fieldsets.jsx:804-808），本文件不重复该校验。
- v1 遗留词条为官方文案直引（"Legacy interface"/"Configure new interface"/"This action will delete…"），zh-CN 对齐见 docs/04:466；A6-A10 四项搭建器比对在 docs/09 仍为「待比」态（docs/09:90-94），v3 验收时可作为本面弹窗内的深度比对清单。

---

## 9. 面 G · 通知模板管理页（approvalMsgTpls）

> 逆向兼容实现仓库现状（2026-10-21 核实）：**官方的审批消息模板管理页签在兼容实现中整体未实现**。
> 官方形态 = 挂在 notification-manager 插件设置页的一个页签「Approval message templates」（chunk 295, module 5194，docs/04 §1.6 / §9.2）；
> 兼容实现只实现了 Workflow 配置侧的通知组（选已有模板 / 自定义模板）、approvalMsgTpls 客户端 schema 注册、服务端种子与发送链。
> 模板的「管理」（列表 / 新建 / 编辑 / 删除）在兼容实现中只能依赖服务端种子模板或直连 API，无任何界面。
> 以下清单按官方规格登记兼容实现缺口（G14–G18，逐条标注【兼容实现缺口】），并如实登记兼容实现已有实现（G1–G13）与服务端契约（G19–G22）。

### 源文件清单

| 文件 | 行数 | 角色 |
|---|---|---|
| `plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx` | 520 | 通知组 fieldset（官方 chunk 931 module 9785 复刻）：NotificationList / TemplateField / ConfigureTemplateButton / 变量树，模板下拉消费 approvalMsgTpls:list |
| `plugin-workflow-approval/src/client-v2/models/registerCollections.js` | 232 | 客户端集合注册（官方 module 334 复刻）：approvalMsgTpls schema（:142-157）、registerApprovalCollections（:198）、bindDataSourceLoaded（:218） |
| `plugin-workflow-approval/src/client-v2/models/zh-CN.js` | 402 | 通知组与模板页词条（:140-143 todo/done 组、:157 Add channel、:184 Approval message templates、:188 Approval notification） |
| `plugin-workflow-approval/src/client-v2/models/shared.js` | 285 | NOTIFICATION_KIND（:46）/ TEMPLATE_TYPE（:47）常量 |
| `plugin-workflow-approval/src/client-v2/index.jsx` | 808 | Plugin.load 接线：i18n bundle（:783）、registerApprovalModelLoaders + ensureApprovalCollections + bindDataSourceLoaded（:790-795） |
| `plugin-workflow-approval/src/client-v2/fieldsets.jsx` | 901 | 触发器 done 组接入（:457-462）、节点 todo 组接入（:823-828） |
| `plugin-workflow-approval/src/server/collections/approvalMsgTpls.js` | 22 | 服务端集合定义（snowflakeId id / type / title / notificationType / template jsonb） |
| `plugin-workflow-approval/src/server/notifications.js` | 198 | seedDefaults（:41）、resolveMessages（:90）、send（:114）、sendTodo（:132）、sendDone（:170） |
| `plugin-workflow-approval/src/server/index.js` | 428 | approvalMsgTpls REST CRUD 授权（:60）、afterStart 种子（:66-68）、sendTodo/sendDone 触发点（:211 / :407） |

核对命令：`grep -rn notification plugin-workflow-approval/src/client-v2/`（本轮已跑，命中以上 client-v2 文件；`grep -rn registerNotificationTemplatePage|pluginSettingsManager|aclSnippet` 在 client-v2/ 与 client/ 均零命中，证实管理页签未注册）。

### 施工提示

1. **兼容实现缺口的形态**：官方模板管理页不是审批插件自己的路由页，而是通过 `registerNotificationTemplatePage`（docs/04 §1.6，主包:14119-14134）向 notification-manager 插件设置页**追加页签**——key `templates`、标题 `t("Approval message templates")`、`aclSnippet: "pm.notification.templates"`、sort 2、`componentLoader: () => chunk 295 → module 5194`，且 `pluginSettingsManager.has("notification-manager.templates")` 已存在则幂等跳过。v3 AI portal 若没有 notification-manager 设置页这一宿主面，页签注册（G14）需重新定形态 → 判 tbd；列表与 CRUD 四能力（G15–G18）照官方规格直接 portal-rebuild。
2. **schema 占位需补解析方**：兼容实现 `registerCollections.js:149` 的 `enum: '{{notificationTypeOptions}}'` 与 `:151` 的 `optionRender: '{{MessageTypeOptionRender}}'` 是官方管理页表单的模板占位（Channel type 选项来自 notification-manager 的 channelTypes registry；Message type To do[gold]/Done[blue] Tag 渲染），兼容实现中无解析方——复刻 G16 表单时需实现这两处。
3. **已有消费点可直接复用**：G6 模板下拉已在兼容实现实测可用（`approvalMsgTpls:list { pageSize:200, filter:{ notificationType, type } }`）；uuid 主键集合 update 必须带 `filterByTk`（`filter={"id":…}` 静默 no-op 返回 200 {}，docs/09:280 alpha.9 宿主坑）——管理页的 update/destroy 同样适用。
4. **模板数据结构**：`templateType=custom` 时 `template` 存对象 `{title, content[, options]}`；`templateType=template` 时存模板 id，服务端 `resolveMessages` 按 `filterByTk` 查表且校验 `type` 匹配（notifications.js:90-112）。模板体为 Handlebars（`{{approval.*}}` / `{{applicant.nickname}}` / `{{statusText}}`），渲染委托 plugin-notification-manager。
5. **可选依赖降级**：兼容实现对 `@nocobase/plugin-notification-manager/client-v2` 为可选 require（notificationsFieldset.jsx:24-29），取其 `ContentConfigForm` 渲染非站内渠道的自定义模板弹窗（:272/:293）；缺包或渠道为 `in-app-message` 时回退站内信五字段。v3 portal 需确认 notification-manager 是否随宿主启用，否则 G8 非站内分支无内容表单可用。
6. **内置数据**：服务端 afterStart 幂等种内置渠道 `approval-todo-in-app-message`（meta editable:true/deletable:false）与「Approval todo / Approval done」双模板（notifications.js:41-87）；管理页复刻后列表开箱即有两条种子，双端 demo 逐字段对齐取证见 docs/09 §7（:278）。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
|---|---|---|---|---|---|
| G1 | approvalMsgTpls 客户端集合 schema 注册（notificationType『Channel type』select + notificationTypeOptions 枚举占位、title『Template title』、type『Message type』todo/done 带 MessageTypeOptionRender optionRender、template json；migrationRules overwrite） | plugin-workflow-approval/src/client-v2/models/registerCollections.js:142 | 宿主注册面 | docs/04 §1.3（docs/04-client-v2-analysis.md:79，官方 module 334 主包:12287-12348） | portal-rebuild |
| G2 | 集合注册执行与重挂：registerApprovalCollections（main 数据源缺才补，hidden）+ bindDataSourceLoaded（dataSource:loaded 事件重跑），Plugin.load 接线 | plugin-workflow-approval/src/client-v2/models/registerCollections.js:198（接线 src/client-v2/index.jsx:792-795） | 宿主注册面 | 兼容实现自实现（官方对照 docs/04 §1.3 主包:14173-14177） | portal-rebuild |
| G3 | 通知组双端接入：触发器字段集渲染 done 组（完成通知申请人）、节点字段集渲染 todo 组（待办通知审批人），同一 NotificationList 组件写 config.notifications | plugin-workflow-approval/src/client-v2/fieldsets.jsx:458（节点侧 :824） | 宿主注册面 | docs/04:176、docs/04:452；docs/09 §7:279（K-5 闭环） | portal-rebuild |
| G4 | 通知渠道选项：notificationChannels:list pageSize:200 拉渠道（name/notificationType/title），渲染为禁用渠道 Select | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:408（渲染 :453-459） | notificationChannels:list | docs/04:490（chunk 931:2105） | portal-rebuild |
| G5 | 通知行结构 Form.List：禁用渠道 Select（必填）+ templateType Select（Template/Custom，切换清空 template）+ TemplateField + 删除钮 + 底部 Add channel Select（过滤已用渠道、add 默认 templateType=template）+ 组标签/说明文案 | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:435（切换清空 :467；Add channel :491-503） | 宿主注册面 | docs/04:452（chunk 931:2060-2302）；docs/09 §7:279 | portal-rebuild |
| G6 | 模板形态=Template：RemoteSelect 拉取模板列表（filter {notificationType, type}，pageSize 200；mapOptions title→id；渠道未选时 ready=false） | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:321（请求 :328） | approvalMsgTpls:list | docs/04:452；docs/09 §7:279 | portal-rebuild |
| G7 | 宿主缺 RemoteSelect 兜底：PlainTemplateSelect 普通 Select 自行拉取模板，未选渠道禁用 | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:344（请求 :350） | approvalMsgTpls:list | 兼容实现自实现（alpha.9 宿主坑 docs/09:280） | tbd（兜底是否保留取决于 v3 宿主是否导出 RemoteSelect） |
| G8 | 自定义模板配置弹窗 ConfigureTemplateButton：Button+Modal+Form；channelType=in-app-message 或缺 nmClient 时用站内信五字段，否则委托 notification-manager ContentConfigForm；确认 validateFields 后写回 template 值 | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:260（分支 :272、:288-293） | 宿主注册面 | docs/04:452（custom 用 notification-manager ContentConfigForm）；docs/09 §7:279 | portal-rebuild |
| G9 | 站内信模板五字段 InAppTemplateFields：title（必填）、content（必填，TextArea 8 行，delimiters {{{ }}}）、options.url / options.mobileUrl（内外链说明 extra）、options.duration（默认 5 秒） | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:215（duration :244-255） | 宿主注册面 | docs/04 官方 N（chunk 931）；docs/09 §7:279 | portal-rebuild |
| G10 | 变量输入器：TemplateVariableInput（Input + FlowContextSelector『x』钮，光标处插入 {{path}} 并回置焦点）/ TemplateContentInput（TextArea 变体，可定制 delimiters） | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:121（TextArea 变体 :171） | 宿主注册面 | docs/04 官方 M/I（chunk 931） | portal-rebuild |
| G11 | 变量树构建 useNotificationMetaTree：todo 组按 APPROVAL_KEY_ORDER 保留六键且组名改「当前审批记录」；done 组把其余变量并入 approval 子级；追加 $context（Trigger variables）/$system（System variables）根并去重 | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:87（核心 :96-101） | 宿主注册面 | docs/04:452（LY/N5 变量面 chunk 931:2646+）；docs/09 §9:298 | portal-rebuild |
| G12 | 固定变量集：useTodoTemplateVariables（applicant.nickname + approval 六键）/ useDoneTemplateVariables（statusText + approval 三键），并与宿主 useWorkflowVariableOptions concat | plugin-workflow-approval/src/client-v2/models/notificationsFieldset.jsx:361（done :380；concat :418-422） | 宿主注册面 | docs/04:452（module 3362 chunk 931:2646+）；docs/09 §9:298 | portal-rebuild |
| G13 | 通知组中文词条注册：Todo/Done notifications 及描述、Add channel、Approval message templates、Approval notification 等，i18n bundle 在 Plugin.load 挂载 | plugin-workflow-approval/src/client-v2/models/zh-CN.js:140（templates 词条 :184；挂载 index.jsx:783） | 宿主注册面 | docs/04:471 通知 i18n 清单；兼容实现自实现 | portal-rebuild |
| G14 | 模板管理页签注册【兼容实现缺口】：官方向 notification-manager 设置页追加页签 key=templates、标题 t("Approval message templates")、aclSnippet pm.notification.templates、sort 2、componentLoader chunk 295→module 5194、幂等；兼容实现零实现（grep registerNotificationTemplatePage/pluginSettingsManager/aclSnippet 无命中，仅 zh-CN.js:184 词条占位） | 兼容实现缺失（词条占位 src/client-v2/models/zh-CN.js:184） | 宿主注册面 | docs/04 §1.6:97-103（chunk 295 module 5194） | tbd（v3 portal 是否存在 notification-manager 设置页宿主面待验证） |
| G15 | 模板管理列表【兼容实现缺口】：表格 + CollectionFilter 过滤 + 刷新 + 分页（sort ["-createdAt"]） | 兼容实现缺失（兼容实现中该资源唯一消费点为 G6 下拉） | approvalMsgTpls:list {page,pageSize,sort:["-createdAt"]} | docs/04:454/456（chunk 295:556）、docs/04:491 | portal-rebuild |
| G16 | 新建模板表单【兼容实现缺口】：Message type（To do[gold]/Done[blue] Tag）、Template title、Channel type（选项来自 notification-manager channelTypes registry）、ContentConfigForm template | 兼容实现缺失（schema 侧字段定义 registerCollections.js:149-155 为占位） | approvalMsgTpls:create {values} | docs/04:455（chunk 295:278）、docs/04:516 | portal-rebuild |
| G17 | 编辑模板【兼容实现缺口】 | 兼容实现缺失 | approvalMsgTpls:update | docs/04:516（chunk 295:294） | portal-rebuild |
| G18 | 删除模板【兼容实现缺口】：行删除带 confirm；删除失败提示 "Template delete requires record id." | 兼容实现缺失 | approvalMsgTpls:destroy {filterByTk} | docs/04:456（chunk 295:312）、docs/04:516 | portal-rebuild |
| G19 | approvalMsgTpls REST CRUD 授权：loggedIn 放行 list/create/update/destroy | plugin-workflow-approval/src/server/index.js:60 | approvalMsgTpls:list/create/update/destroy | 兼容实现自实现（官方对照 docs/04:516 chunk 295 消费端点） | server-keep |
| G20 | approvalMsgTpls 服务端集合定义：snowflakeId id、type（默认 todo）、title、notificationType、template jsonb、createdAt/updatedAt，simplePaginate | plugin-workflow-approval/src/server/collections/approvalMsgTpls.js:6 | approvalMsgTpls:*（资源定义） | 兼容实现自实现（字段对照 docs/04:79） | server-keep |
| G21 | 内置渠道 + 双默认模板种子：afterStart 幂等种渠道 approval-todo-in-app-message（meta editable:true/deletable:false）与 Approval todo/Approval done 两模板（Handlebars 模板体逐字段对齐官方 demo） | plugin-workflow-approval/src/server/notifications.js:41（模板种 :58-83；接线 src/server/index.js:66-68） | server-keep（服务端直写 db，不走 REST） | docs/09 §7:278；兼容实现自实现 | server-keep |
| G22 | 模板解析与发送链：resolveMessages（custom 直用 template 对象；template 形态按 filterByTk 查表且校验 type 匹配）→ notification-manager send；sendTodo（节点入口 PENDING 记录）/sendDone（终态 4/-1/1）接线 | plugin-workflow-approval/src/server/notifications.js:90（send :114；sendTodo :132；sendDone :170；触发点 src/server/index.js:211/:407） | server-keep（内部调用 notification-manager send） | docs/09 §7:272/278；兼容实现自实现 | server-keep |

### 不确定项（如实标注）

- 官方 chunk 295 module 5194 的表格列序、分页控件具体形态（每页条数选项等）未在 docs/04 §9.2 逐字段展开，G15/G16 仅登记 docs/04 已取证的部分（资源参数、字段清单、过滤/刷新/删除/新建四能力、失败提示文案）；施工时需按 docs/12 后续补录或对官方 bundle 复核。
- G7/G14 的 tbd 判定依据已在表中注明（宿主 RemoteSelect 导出 / notification-manager 设置页宿主面），其余无猜测项。

---

## 10. 面 H · 注册基建（插件生命周期 / registerModelLoaders / registerCollections / api() 小工具 / i18n 资源面）

> - **对象**：client-v2 lane 的宿主注册面与共享基建。源文件为 ask 指定的 5 个：`index.jsx`（808 行）、`models/registerModelLoaders.js`（165 行）、`models/registerCollections.js`（232 行）、`models/shared.js`（285 行）、`models/zh-CN.js`（402 行）；行数本轮 `wc -l` 实测一致。
> - **与其他面的边界**：任务类型对象的 Actions 工具条 / useActionParams / ApplyNew 已归面 A（A 头注声明「本面只覆盖前者模型 + 后者的 Actions/ApplyNew」，故 Item/Detail/getPopupRecord/alwaysShow 登记于此面 H5）；弹窗五操作 ActionButtons/ReassigneeSelect 已归面 B（B 表 33-34 行）；TaskDetailLayout 弹窗布局与 appends 已归面 C（C-30）；approvalMsgTpls 通知语义已归面 G（G1/G2 与本面 H22 同一 schema，交叉引用不重复施工）。
> - **取证纪律**：官方对照只引用既有取证（docs/04 §1/§2/§3/§4/§5/§6/§10/§11、docs/06 §3、docs/09 §2/§4、docs/12 节点抽屉注册表行 2-3），未重做官方 bundle 分析；兼容实现自有实现标「兼容实现自实现」。全部锚点为本会话实读行号。

### 源文件清单

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `plugin-workflow-approval/src/client-v2/index.jsx` | 808 | 插件类与生命周期接线（:777-805）、api()/cleanParams/splitCollection 小工具（:61-102）、状态映射（:104-133）、触发器类（:182-248）、指令类（:252-316）、双任务类型对象（:688-773）、popupId 兜底（:13-16） |
| `plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js` | 165 | 私有模型类 loader 全表（官方 module 9813 的 1:1 port，文件头 :1-5）：GUARD/WeakSet 防重（:60-61）、syncLoad（:63-65）、registerApprovalModelLoaders（:68-139，46 条 loader）、ensure 兜底（:143-145）、re-exports（:147-165） |
| `plugin-workflow-approval/src/client-v2/models/registerCollections.js` | 232 | 客户端集合注册（官方 module 334 `q.k` 的 1:1 port，文件头 :1-8）：两枚举表（:11-33）、8 个集合 schema（:35-195）、COLLECTIONS 清单（:186-195）、registerApprovalCollections（:198-215）、bindDataSourceLoaded（:218-230） |
| `plugin-workflow-approval/src/client-v2/models/shared.js` | 285 | 共享常量与工具（官方 module 358 / 9488 + chunk 502/654/733 helper，文件头 :1-7）：状态常量与枚举（:11-88）、MZ/translateLabel（:92-103）、集合名与引擎工具（:106-154）、审批数据虚拟关联基建（:157-247） |
| `plugin-workflow-approval/src/client-v2/models/zh-CN.js` | 402 | 审批插件命名空间 zh-CN 词条 395 条（本会话 `node -e "Object.keys(...).length"` 实测），Plugin.load 挂载（index.jsx:783）；措辞源 docs/05（文件头 :3 声明） |

核对命令（本会话已跑）：`wc -l`（五文件行数如上）；`grep -n "function ApplyItem" index.jsx` → :321 与 :640 双定义（后者覆盖前者，:321-339 为死代码）；`grep -rn registerWorkflowNoticeProvider plugin-workflow-approval/src/` → 零命中（exit=1，兼容实现未实现该官方注册面）；`grep -c "loader: syncLoad" registerModelLoaders.js` → 46。

### 施工提示

1. **插件生命周期与注册顺序（v3 施工顺序契约）**：`PluginApprovalClientV2.load()`（index.jsx:778-804）的次序是——置 window 调试标记（:779-781）→ `app.pm.get('workflow')` 取 workflow 客户端（:780）→ **先注册 i18n 词条再注册触发器/指令**（:783 在 :784-787 之前，保证类 title/description 与变量面板 t() 可解析中文）→ `registerTrigger('approval')` → `registerInstruction('approval')` → `registerTaskType('approval-apply'/'approval-todos')` → 拿 `this.flowEngine`（client-v2 Plugin 基类提供，:789-790）后 `registerApprovalModelLoaders` → `ensureApprovalCollections`（models/interfaceConfig.jsx:29，不在本面文件清单，配置弹窗侧的集合补挂）→ `bindDataSourceLoaded` → `approvalAudienceTypes` 上下文属性。对照官方 load 顺序（docs/04 §1.1:57：registerAudienceTypes → registerCollections → registerModelLoaders → registerWorkflowExtensions → registerNotificationTemplatePage）：兼容实现把官方的 `registerAudienceTypes` 简化为引擎上下文属性 stub（H7），把 `registerNotificationTemplatePage` 整体缺位（面 G14 已登记），并**缺 `registerWorkflowNoticeProvider`（H8，兼容实现缺口）**。
2. **registerModelLoaders 全表**：46 条 loader（registerModelLoaders.js:75-134）全部为 `extends 宿主模型 + syncLoad 同步模块` 两字段结构，父类全部来自 flow-engine 内建模型族（NodeDetails/Details/ChildPage/CollectionBlock/FormBlock/Form/Action/FlowModel/DataBlockModel）。注册前先幂等注册菜单模型 `ApprovalBlocksMenuModel`（registerModels，:70-72），再以 WeakSet + 实例标记 `__workflowApprovalModelLoadersRegistered__` 双护栏防重（:60-73）。**与官方计数差 1**：docs/04 §1.4:87 / §5:255 记官方 45 个；兼容实现 46 条，多出 `ApprovalTaskListBlockModel`（:95，docs/08:182 记其为 chunk 51 port 的一部分、且为 Initiations/Todos 两模型的基类 centerBlocks.jsx:195/:223）——是官方 §5 清单漏列还是兼容实现增补，本轮未重做官方 bundle 取证，**如实标注待核**。v3 复现须先确认宿主 flow-engine 导出这批父类模型名，缺失即整表失效（每条 loader 都 extends 宿主名）。
3. **registerCollections 集合**：8 个集合全部注册进 **main 数据源**且强制 `hidden:true`（:210），缺才补（:209 判 `getCollection`）。字段语义要点：approvals（:58-87）带 `simplePaginate`、`migrationRules:['schema-only']`、status 走 STATUS_ENUM、`action` jsonb；approvalRecords（:89-121）带双索引 `(jobId,index) 唯一 + (userId,status)`（:120）；approvalMsgTpls `migrationRules:['overwrite']`、其 `enum:'{{notificationTypeOptions}}'` 与 `optionRender:'{{MessageTypeOptionRender}}'` 为占位、兼容实现无解析方（面 G 施工提示 2 已登记）；approvalExecutions.reason 枚举占位 `{{ExecutionReasonOptions}}`（:136）同理待确认 v3 解析方。`bindDataSourceLoaded`（:218-230）监听宿主 `dataSource:loaded` 事件、dataSourceKey 为 `main` 或 `*` 时重跑注册——**v3 若无多数据源事件总线，须在宿主数据源就绪回调处等价补挂**，否则首次注册早于 main 数据源加载时会静默落空（:203-206 try/catch 返回 false）。
4. **api() 小工具与 X-Data-Source 约定**：`api(action, params, body)`（index.jsx:61-80）= fetch `/api/${action}`，token 取 `localStorage.NOCOBASE_TOKEN` 走 Bearer，**固定头 `'X-Data-Source': 'main'`（:70）**——这是兼容实现绕过宿主 useAPIClient 的直连约定（docs/06 §3:54「v2 虚拟模块面里无 useAPIClient，最稳」），与官方 `api.resource()` 访问器（docs/04 §7.0:347）是两条等价通道；GET/POST 由 `body === undefined` 判定（:63），`credentials:'include'`（:73），失败抛 `errors[0].message ?? HTTP <status>`（:77）。`cleanParams`（:82-93）把数组序列化为 `key[]`、对象/数组元素 `JSON.stringify`、剔除 undefined——listMine 的 filter 数组值（如 status:[0,1,2,3]）依赖此约定。v3 portal 若有统一请求层可替换实现，但 **X-Data-Source: main 头与数组语义必须保留**，否则多数据源宿主与列表过滤会静默错位。（勘误 2026-10-21，docs/14 终审 H27：v3 portal-sdk 以重复裸键序列化数组而非 `key[]`，服务端两种形态等价解析——**契约是数组语义，形态随请求层**，实测全链路成立。）
5. **i18n 资源面**：兼容实现把 395 条 zh-CN 词条一次性 `this.app.i18n.addResourceBundle('@nocobase/plugin-workflow-approval','zh-CN',zhCN,true,true)`（index.jsx:783，深合并 + 不覆盖）挂进命名空间，替代官方插件自带 locale 包；t() 的 ns 解析有三条通道——① 宿主 `{{t("...", { ns: "@nocobase/plugin-workflow-approval" })}}` 模板串（MZ 生成，shared.js:92-94）；② flow 上下文引擎 t + ns 回退链（index.jsx:142-146：`ns:['@nocobase/plugin-workflow-approval','client'], nsMode:'fallback'`，抽屉渲染在 FlowContext 之外时回落全局 flow-engine 实例 t）；③ translateLabel（shared.js:97-103，`{{t("…")}}` 模板串正则剥壳后走 `engine.context.t`）。词条分组速查：界面搭建器/设计器（zh-CN.js:10-61）、动作与确认弹窗（:52-68）、审批人编辑器（:82-108）、状态枚举（:122-136）、退回范围（:137-139）、通知（:140-143/:157/:184）、v1→v2 迁移警告（:16-22/:147-151/:213/:241/:248-249/:274-275/:367-368）、权限与 returnToNodeKey 校验错误（:390-399）。docs/09 §2 的 C1「i18n 词条抽查」至今仍标「待比」（docs/09:105）——v3 移植时建议按此分组逐组核对，措辞源为 docs/05。
6. **死代码与兼容实现事实**：`index.jsx` 存在**两个 `function ApplyItem`**（:321 与 :640，函数声明后者覆盖前者）——:321-339 连同其引用的 `StatusTag`（:130-133，仅 :335 一处引用）是死代码；活跃实现是 :640-658（走 taskCards.ApprovalStatusTag/TaskCardFields）。但 `STATUS_TAG`/`RECORD_TAG` 两张映射表（:106-128）仍被任务类型 Actions 的筛选选项构造活跃消费（:712/:753-756），不能随死代码一起删。v3 重建时应以 :640 版本为准并复用两张映射表。
7. **版本锚点**：docs/09 §4 实证官方 demo（alpha.10）与本地（alpha.9）的插件 client-v2 bundle SHA 双版一致（docs/09:204）——本面全部注册面**与宿主小版本解耦**，v3 可按 alpha.9 契约直移；但 H8（noticeProvider）、H7（audience Transfer 组件）依赖宿主 workflow client 的注册通道是否在 v3 保留，已逐条标注。

### 功能点清单

| # | 功能点 | v2锚点 | API | 官方证据 | v3判定 |
| --- | --- | --- | --- | --- | --- |
| H1 | 插件 load() 生命周期与注册顺序（window 调试标记 → pm.get('workflow') → i18n → registerTrigger → registerInstruction → registerTaskType×2 → registerModelLoaders → ensureApprovalCollections → bindDataSourceLoaded → audienceTypes；flowEngine 由 client-v2 Plugin 基类提供） | plugin-workflow-approval/src/client-v2/index.jsx:777 | 宿主注册面 | docs/04 §1.1:57（官方 load 依序注册）；docs/06 §3:50 | portal-rebuild |
| H2 | zh-CN 命名空间词条挂载：addResourceBundle('@nocobase/plugin-workflow-approval','zh-CN', 395 条, 深合并不覆盖) 替代官方自带 locale；t() 三通道（模板串 ns / 引擎 t 回退链 :142-146 / translateLabel） | plugin-workflow-approval/src/client-v2/index.jsx:783 | 宿主注册面 | docs/04 §10:462（官方 ns 即此命名空间）；docs/06 §3（zh-CN 词条，docs/08 §4 第二轮）；兼容实现自实现挂载 | portal-rebuild |
| H3 | 触发器注册 registerTrigger('approval', ApprovalTrigger)（工作流画布/列表出现「审批事件」触发器的前提） | plugin-workflow-approval/src/client-v2/index.jsx:784 | 宿主注册面 | docs/04 §1.5:92 | portal-rebuild |
| H4 | 指令注册 registerInstruction('approval', ApprovalInstruction)（画布审批节点、节点类型 chip 与描述文案的来源） | plugin-workflow-approval/src/client-v2/index.jsx:785 | 宿主注册面 | docs/04 §1.5:93；docs/12 行 2-3（宿主按 instruction 注册渲染 type chip 与描述） | portal-rebuild |
| H5 | 双任务类型注册面：{key:'approval-apply', title:'我的申请', collection:'approvals', action:'listMine'} / {key:'approval-todos', title:'我的审批', collection:'approvalRecords', action:'listMine'}，含 Item/Detail/getPopupRecord（原始响应壳 e.data.data）/alwaysShow:true；Actions/useActionParams 细项归面 A | plugin-workflow-approval/src/client-v2/index.jsx:786 | 宿主注册面（协议字段引用 approvals:listMine / approvalRecords:listMine） | docs/04 §1.5:94、§6:312（taskType 协议字段清单） | portal-rebuild |
| H6 | popupId 路由参数兜底：useParamsId 读 useParams().popupId，Detail 包装器取 record?.id ?? popupId（宿主任务中心 Modal 打开时 record 未进上下文时深链仍可拉详情） | plugin-workflow-approval/src/client-v2/index.jsx:13 | 宿主注册面（弹窗路由契约，无后端交互） | 兼容实现自实现（官方契约 docs/04 §6:325 URL 构造 eO） | portal-rebuild |
| H7 | approvalAudienceTypes 引擎上下文属性：defineProperty 惰性返回 {register:()=>{}, types:[{key:'role'},{key:'users'}]}（官方为带 Transfer 穿梭框组件的注册表，兼容实现为 stub，触发器「Who could initiate=指定用户」Tab 渲染回落） | plugin-workflow-approval/src/client-v2/index.jsx:797 | 宿主注册面（官方形态消费 roles:list，兼容实现 stub 无） | docs/04 §1.2:63-66 | portal-rebuild（官方 Transfer 形态为兼容实现缺口，随触发器面板补齐） |
| H8 | 旧版界面迁移警告 provider（官方 registerWorkflowNoticeProvider：trigger-node-card 面上 v1 applyForm 残留时出 warning 通知）【兼容实现缺口】：grep 全 src 零命中；仅词条占位 | 兼容实现缺失（词条占位 plugin-workflow-approval/src/client-v2/models/zh-CN.js:21） | 宿主注册面 | docs/04 §1.5:95（主包:14190-14205） | tbd（依赖 v3 宿主 workflow client 是否保留 noticeProvider 通道；v3 若无 v1 lane 可整体非目标） |
| H9 | 触发器类静态面：sync=false、title/description 中文、三 Loader（Preset/Fieldset/TriggerFieldset → fieldsets 组件）、createDefaultConfig {mode:0, centralized:false, audienceType:1, recordShowMode:false, useSameTaskTitle:false}、validate=!!config.collection | plugin-workflow-approval/src/client-v2/index.jsx:182 | 宿主注册面 | docs/04 §3:133-146 | portal-rebuild |
| H10 | 触发器 useVariables：根=[工作流名{key,label}]，children=nodeTitle/title/status/data(业务字段+appends 编译)/records(id,userId,status,comment,updatedAt) 五字段；t 走 ns 回退链，数据源经 flowEngineGlobal 可选 require 兜底（:28-33） | plugin-workflow-approval/src/client-v2/index.jsx:198 | 宿主注册面 | docs/04 §3:138（useVariables: G） | portal-rebuild |
| H11 | 触发器 getCreateModelMenuItem（画布「数据区块」菜单两项）：approvalInformation→ApprovalDetailsModel(main/approvals) + 原始申请内容→NodeDetailsModel(dataPath $context.data，ds:collection 由 splitCollection 解析)；nodeType==='cc' 时隐藏第一项 | plugin-workflow-approval/src/client-v2/index.jsx:210 | 宿主注册面 | docs/04 §3:148-150 | portal-rebuild |
| H12 | 指令类静态面：type='approval'/group='manual'/async=true/icon=AuditOutlined、三 Loader+ComponentLoader（画布组件）、createDefaultConfig {approvalUid: makeUid('approval_')} 即时分配界面 uid | plugin-workflow-approval/src/client-v2/index.jsx:252 | 宿主注册面 | docs/04 §4:199-207 | portal-rebuild |
| H13 | 指令 useVariables：每个上游审批节点向宿主「节点数据($jobsMapByNodeKey)」根贡献一项 {value:node.key, label:node.title, children:同触发器五字段}；数据表/预载读 workflow.config | plugin-workflow-approval/src/client-v2/index.jsx:271 | 宿主注册面 | docs/04 §4:205（官方 D） | portal-rebuild |
| H14 | 指令 branching：config.branchMode 为真时产出三支 通过(2)/拒绝(-1)/退回(1)（画布分支泳道） | plugin-workflow-approval/src/client-v2/index.jsx:280 | 宿主注册面 | docs/04 §4:203 | portal-rebuild |
| H15 | 指令 getCreateModelMenuItem：节点结果菜单 `#<nodeId>` → children[data] → NodeDetailsModel(dataPath `$jobsMapByNodeKey.<nodeKey>.data`) | plugin-workflow-approval/src/client-v2/index.jsx:289 | 宿主注册面 | docs/04 §4:211 | portal-rebuild |
| H16 | 菜单模型同步注册 + 防重护栏：getModelClass('ApprovalBlocksMenuModel') 缺才 registerModels；WeakSet + `__workflowApprovalModelLoadersRegistered__` 实例标记双护栏，重入返回 false | plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js:68 | 宿主注册面 | docs/04 §1.4:86-87（主包:11405-11406/11422-11425）、§5:304 | portal-rebuild |
| H17 | 私有模型类懒加载 loader 全表（46 条 extends+syncLoad）：审批单详情 4 + 我的申请卡 4 + 子页面/审批块/中心列表块/深链页 11 + 表单模式 9 + 动作模型 9 + 我的审批卡 4 + 触发器页 3 + 相关审批 1；父类全为 flow-engine 内建模型名 | plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js:75 | 宿主注册面 | docs/04 §1.4:83-87、§5:255-301（官方 45 条全清单）；46 vs 45 差异（多 ApprovalTaskListBlockModel :95）如实标注待核 | portal-rebuild |
| H18 | ensureApprovalModelLoaders 兜底入口（配置弹窗渲染前 ensure，等价官方 chunk 483/617 `(0,g.r)(p)`）+ 17 个模型类 re-exports 供跨文件消费 | plugin-workflow-approval/src/client-v2/models/registerModelLoaders.js:143 | 宿主注册面 | docs/04 §1.4:83-87；注释 :141-142 标注官方调用点 | portal-rebuild |
| H19 | approvals 客户端集合 schema（15 字段：id/collectionName/dataKey/workflow(m2o)/workflowKey/executions(b2m through approvalExecutions)/rounds/latestRound/records/status(枚举)/data(json)/applicantRole/createdAt/updatedAt/createdBy(Initiator)/action(jsonb)；simplePaginate、migrationRules schema-only） | plugin-workflow-approval/src/client-v2/models/registerCollections.js:58 | 宿主注册面 | docs/04 §1.3 表行 :76（主包:12595-12733） | portal-rebuild |
| H20 | approvalRecords 客户端集合 schema（20 字段含 approval/user/job/execution/node/workflow/index/title/status(枚举)/comment/returnToNodeKey/type/prevRecord/dataBefore/dataAfter/changes；索引 (jobId,index) 唯一 + (userId,status)；simplePaginate） | plugin-workflow-approval/src/client-v2/models/registerCollections.js:89 | 宿主注册面 | docs/04 §1.3 表行 :77（主包:12349-12527） | portal-rebuild |
| H21 | workflows / flow_nodes 隐藏精简集合（仅 id/title[/createdBy]，供 approval 关系字段解析目标） | plugin-workflow-approval/src/client-v2/models/registerCollections.js:35 | 宿主注册面 | docs/04 §1.3 表行 :74-75 | portal-rebuild |
| H22 | 其余四集合 schema：approvalExecutions（reason 枚举占位 {{ExecutionReasonOptions}}/snapshot jsonb/records）、approvalMsgTpls（overwrite，与面 G1 同一 schema 交叉引用）、approvalAudiences（索引 workflowId+type+targetKey）、approvalAudienceUsers（唯一索引 workflowId+userId） | plugin-workflow-approval/src/client-v2/models/registerCollections.js:123 | 宿主注册面 | docs/04 §1.3 表行 :78-81 | portal-rebuild |
| H23 | 状态枚举元数据两表：STATUS_ENUM 8 项（tExpr ns 模板串 + color/icon/editable/terminated 标记）与 RECORD_STATUS_ENUM 10 项（含 value:null「Assigned」蓝/Hourglass），供集合 status 字段 uiSchema 与筛选选项 | plugin-workflow-approval/src/client-v2/models/registerCollections.js:11 | 宿主注册面 | docs/04 §2:118-119（Wd/Oe 8+10 项逐一对照） | portal-rebuild |
| H24 | registerApprovalCollections 执行器：取 main 数据源（try/catch 失败返回 false），逐 schema getCollection 缺才 addCollection 且强制 hidden:true，返回 added>0 | plugin-workflow-approval/src/client-v2/models/registerCollections.js:198 | 宿主注册面 | docs/04 §1.3:70（官方 module 334 `u`，主包:12791-12825） | portal-rebuild |
| H25 | bindDataSourceLoaded：监听宿主 dataSource:loaded 事件，dataSourceKey ∈ {main,*} 时重跑 H24（多数据源加载后补注册）；事件总线未就绪 try/catch 静默 | plugin-workflow-approval/src/client-v2/models/registerCollections.js:218 | 宿主注册面 | docs/04 §1.3:70（官方 handleDataSourceLoaded，主包:14116-14118） | portal-rebuild |
| H26 | api() 直连小工具：fetch `/api/${action}`、localStorage.NOCOBASE_TOKEN→Bearer、固定头 X-Data-Source:'main'、body 有无定 GET/POST、credentials include、失败抛 errors[0].message ?? HTTP status | plugin-workflow-approval/src/client-v2/index.jsx:61 | 宿主注册面（全插件 API 调用的传输层） | docs/06 §3:54（fetch+NOCOBASE_TOKEN 直连）；对照 docs/04 §7.0:347（官方 api.resource 通道） | portal-rebuild（X-Data-Source 头为硬约定） |
| H27 | cleanParams 查询串序列化：数组→`key[]` 逐项、对象/数组元素 JSON.stringify、undefined 剔除（listMine 的 filter.status 数组依赖此约定） | plugin-workflow-approval/src/client-v2/index.jsx:82 | 宿主注册面 | 兼容实现自实现 | portal-rebuild |
| H28 | splitCollection：'ds:collection'→[ds,name]，无冒号回落 ['main', value]（触发器/指令 getCreateModelMenuItem 的 resourceSettings init 消费） | plugin-workflow-approval/src/client-v2/index.jsx:95 | 宿主注册面 | 兼容实现自实现（官方 splitCollectionName 对照 shared.js:127） | portal-rebuild |
| H29 | STATUS_TAG/RECORD_TAG 模块级状态映射（8+11 项）+ StatusTag 组件；活跃消费=双任务类型 Actions 筛选选项（:712/:753-756）；首个 ApplyItem（:321-339）与 StatusTag（:130）为被 :640 覆盖的死代码，v3 不复刻 | plugin-workflow-approval/src/client-v2/index.jsx:106 | 宿主注册面 | 兼容实现自实现（枚举语义对照 docs/04 §2:118-119） | portal-rebuild |
| H30 | shared 状态/常量基建：APPROVAL_STATUS、RECORD_STATUS（含 ASSIGNED:null）、RECORD_TYPE、NOTIFICATION_KIND、TEMPLATE_TYPE、RETURN_TYPE+RETURN_NODE_OPTIONS 四选项、APPROVAL/RECORD_STATUS_LIST+META、TASK_TYPE_APPLY/TODOS、HIDE_APPLY_FORM_DELETE_ACTION 协作标记 | plugin-workflow-approval/src/client-v2/models/shared.js:11 | 宿主注册面 | docs/04 §2:106-125（module 358 常量全表） | portal-rebuild |
| H31 | MZ tExpr 生成器（`{{t("...", { ns: "@nocobase/plugin-workflow-approval" })}}`）+ translateLabel（模板串剥壳经 engine.context.t 翻译，ns 可覆写） | plugin-workflow-approval/src/client-v2/models/shared.js:92 | 宿主注册面 | docs/04 §2:110（CU 命名空间）、§2 注（9488 MZ/kj） | portal-rebuild |
| H32 | 集合名与引擎通用工具：splitCollectionName（'ds:collection'/'ds.collection'）、collectionPathSplit、rootDataSourceManager（沿 previousEngine 链上溯取 dataSourceManager）+ isObj/toStringValue/strOrEmpty/compact/groupHasChildren | plugin-workflow-approval/src/client-v2/models/shared.js:106 | 宿主注册面 | 兼容实现自实现（官方 chunk 502/733 helper 语义，shared.js:1-7 头注） | portal-rebuild |
| H33 | 审批数据虚拟关联基建：VIRTUAL_RELATIONS（approvals.data←dataKey / approvalRecords.data|dataAfter）、任务卡显示白名单/黑名单+通配匹配、resolveDataCollection（三源回退）、makeVirtualCollectionField（构造 belongsTo CollectionField）、resolveApprovalDataFieldPath（字段路径逐段解析，首段 data/dataAfter 换虚拟字段）；消费面在 B/C 模型 | plugin-workflow-approval/src/client-v2/models/shared.js:157 | 宿主注册面 | docs/04 §5:266（官方 resolveVirtualCollectionField，chunk 502:877-930）；shared.js:1-7 头注（chunk 502/654/733） | portal-rebuild |

### 不确定项（如实标注）

- **H17 计数差**：兼容实现注册 46 条 loader，docs/04 §1.4:87/§5:255 记官方 45 个；多出项为 `ApprovalTaskListBlockModel`（registerModelLoaders.js:95），docs/08:182 记其为 chunk 51 port 的一部分且为 Initiations/Todos 的基类（centerBlocks.jsx:195/:223）。官方清单是漏列还是兼容实现增补，本轮按纪律未重做官方 bundle 取证，待核。
- **H8 判 tbd** 的依据：registerWorkflowNoticeProvider 是宿主 workflow client 的注册通道（`grep -rn registerWorkflowNoticeProvider plugin-workflow-approval/src/` 零命中），v3 宿主是否保留该通道、以及 v3 portal 是否存在 v1 lane（决定该警告是否还有意义）均待验证。
- **H22 两处枚举占位无解析方**：approvalMsgTpls 的 `{{notificationTypeOptions}}`/`{{MessageTypeOptionRender}}`（registerCollections.js:149/:151）与 approvalExecutions 的 `{{ExecutionReasonOptions}}`（:136）在兼容实现中无渲染方，v3 复现需实现或确认宿主解析器（前者面 G 施工提示 2 已登记）。
- **H7 官方形态缺口**：官方 registerAudienceTypes 含 role 的 antd Transfer 穿梭框（roles:list paginate:false，docs/04 §1.2:65），兼容实现为 stub；触发器「指定用户」Tab 的完整形态施工时需一并补齐。
- docs/09 §2 的 C1「i18n 词条抽查」在既有审计中仍为「待比」（docs/09:105），本面未替其闭环；H2/H30/H31 的词条措辞仅以 docs/04 §10 分组与 zh-CN.js 实读为据。

---

## 附录 A：Phase 3 v3 兼容四验证结论

> 验证环境：`approval-v3-dev`（NocoBase **3.0.0-alpha.13**，http://127.0.0.1:13810，app 目录 `~/approval-v3-dev/`，内建 postgres 容器 :40817；AI portal `main` 位于 `~/approval-v3-dev/main`，服务基路径 `/x/main/`）。宿主启用插件 99 个，workflow 全家桶（workflow/manual/cc/loop/…）全部 enabled。

### ③ 宿主客户端 lane 机制（源码级实读，2026-10-21）

**结论：v3 与 2.4 完全同构，无阻断，且 v1 兜底 lane 在 v3 上继续可用。**

- `@nocobase/server` 保留 `PluginClientLane = 'client' | 'client-v2'` 类型与 `PM_LANE_ENTRIES`/标记文件映射：`"client-v2": "dist/client-v2/index.js"`、标记 `"client-v2": "client-v2.js"`（server/lib/plugin-manager/options/resource.js:56/:60）。
- 存在 `pm:listClientV2` 风格 API（swagger pm.d.ts:231 「List enabled client-v2 plugins：Return enabled plugins that expose a `dist/client-v2/index.js` entry」）。
- 双 lane 插件的 client lane 响应会**附带** client-v2 URL（resource.js:187-188）——v3 modern client 可按需加载任一 lane。
- 官方 `plugin-workflow@3.0.0-alpha.13` 自身仍同时 ship `dist/client/` + `dist/client-v2/` 双 lane 与 `externalVersion.js`。
- 因此本分支去掉 `client-v2.js` 标记后：插件只进入 client lane 清单 → v3 modern client 的 workflow 设计器仍加载 v1 lane（触发器/指令/任务中心兜底照常注册）；审批中心 UI 不再由插件提供，由 AI portal 复现（本表 292 条 portal-rebuild 的归属）。
- v3 modern client 仍在宿主根路径服务（`/dist/3.0.0-alpha.13/` webpack 产物，`__nocobase_app_client_entry_mode__='modern-only'`）；AI portal 为独立前端（refine + shadcn + @nocobase/portal-sdk，扩展 anatomy 见 `~/approval-v3-dev/main/src/extensions/nocobase-users-example/`：AppExtension{id,priority,routes} + defineAppRoutes + resource meta + lazy）。

### ① externalVersion 依赖兼容（源码级实读）

**结论：机制延续，预计兼容，安装时以 `pm:get` 实证收口。**

- 官方 v3 插件包仍 ship `dist/externalVersion.js`（plugin-workflow@3.0.0-alpha.13 实测存在），peerDependencies 仍写 `"2.x"`（15 个 @nocobase/* 包全部 `2.x`）——v3 应用版本线为 3.0.0-alpha.13，但平台包版本约定未变，本项目 package.json 的 `"2.x"` peerDeps 无需改动。
- 待办：插件装入 v3 后核对 `pm:get` 的 `isCompatible/depsCompatible` 全表通过（对应 docs/11 smoke 第 2 关）。

### ② 集合同步/迁移（2026-10-21 实测）

**结论：一次通过，服务端代码在 v3 上零改动工作。**

- boot 自装成功：`pm:get` 返回 installed=true、enabled=true。
- 六集合全部在 v3 postgres 同步：approvals / approvalRecords / approvalExecutions / approvalAudiences / approvalAudienceUsers / approvalMsgTpls（pg_tables 实查）。

### ④ smoke 建流→发起→终态（2026-10-21 实测）

**结论：docs/11 九关 smoke 对 v3 全绿。**

`node tools/ci-smoke.mjs --base http://127.0.0.1:13810 --account admin@nocobase.com --password <test-password>` → 全部 PASS：sign-in / pm-dependency-compat（isCompatible=true rows=11 failing=0）/ static-asset client:200 / 集合探测+列自愈 / 审批人用户 / 会签工作流建流+启用 / 发起指派（两笔 PENDING、userId 与配置一致）/ 双人提交终态 **APPROVED(4)** / 错误日志扫描（skipped，v3 环境未传 error-log 路径）。

随本轮固化：`scripts/build.js` 新增 `NOCOBASE_EXTERNAL_HOST`（externalVersion 按目标宿主树解析——快照是**按宿主版本线生成**的，2.4 与 v3 一份快照不可兼得；官方 v3 插件同款机制）；`tools/ci-smoke.mjs` 依赖兼容关阈值 20→10 行（去 v2 后外部面收缩，防回归语义不变）。

### ① 附注：运行时 lane 清单（2026-10-21 实测）

- `pm:listEnabled`（client lane，78 插件）含 `@nocobase/plugin-workflow-approval`，URL=`/dist/3.0.0-alpha.13/static/plugins/@nocobase/plugin-workflow-approval/dist/client/index.js`（静态 200）。
- `pm:listEnabledV2`（client-v2 lane，69 插件）**不含本插件**（client-v2 资产 404）——去 v2 在 v3 的运行时表现与设计一致：v3 modern client 只加载 v1 兜底 lane。

### 附录 B：portal 复现期发现（批1-批2）

- **F17（服务端契约缺口，2026-10-21 批2a 发现）**：兼容实现服务端未注册 `approvals:listRelated`——src/server/actions.js 与 dist 均无此 action，而 v2 客户端 RelatedApprovalsModel 一直在调它（centerBlocks.jsx:268 `setRefreshAction('listRelated')`，docs/13 C#13-16）→ v2 兼容实现的相关审批块在此环境必然 404。官方 server 应有该 action（探针矩阵未覆盖）。portal 侧临时回落 `approvals:listMine {filter:{dataKey,collectionName}}` 语义等价；根治=给兼容实现 server 补 listRelated（待办）。
- **portal 栈适配 11 项**（批1 7 + 批2 11，详见两批 commit 与 workflow 报告）：刷新/提交通道改 React Query、字段元数据走 collections:get、退回上游链从 workflow.nodes 沿 upstreamId 回溯（替代 flowEngine inputArgs 链）、记录上下文用 dataKey/collectionName 列（替代 flow-engine record 注入）、皮肤 shadcn 等价重建（语义逐项保留，像素级比对留 Phase 5）等。

### 附录 B2：批4 浏览器冒烟结论（2026-10-21，UI 建流链路）

- **建流链路全通**：/x/main/approvals/workflows UI 新建工作流（标题/数据表/触发方式/发起位置/审批人）→ 默认审批节点落库 → 配置页渲染（触发器摘要/允许撤回/流程结构）→ 启用 → `approvals:create` 发起 → **approvalRecords 正确指派**（config.assignees 存字符串 `["2"]`，服务端 sequelize 整数化无碍，userId=2 PENDING 实证）。**字符串 assignees 悬案关闭：非缺陷。**
- **宿主级缺陷（登记，portal 已绕过）**：`flow_nodes:create` 服务端不落库 upstream.downstreamId（v2:13800 与 v3:13810 双环境复现，DB 取证）→ 多节点链执行遍历会断；批4 保存链路 create 后以 flow_nodes:update 补邻接链。
- **待修缺陷（批5 修）**：P1 新建弹窗「选择用户」添加的行渲染成变量表达式输入（用户选择器缺失，形态接线反了）；P2 触发方式单选映射疑颠倒（UI 选中「数据保存后」→ 库 mode=0，v2 语义 0=保存前/1=保存后）；P3 数据表下拉 `{{t("Users")}}` 原始串未翻译。
- **已清**：b4b e2e 残留测试用户 id 4-6（users:destroy，200×3）。
- **v2:13800 误连事件复核**：批4b 曾误将 :13800 当探针目标并自报清理；恢复会话时在 13800 DB 复核无残留 fixture（`SELECT count(*) FROM workflows WHERE title LIKE '%b4b%'` = 0 佐证可信，Phase 5 前再终核一次）。

### 附录 C：v3 宿主形态探针（E 面前置，2026-10-21 浏览器实测）

**v3 前端 = 三门户 + 设置中心**：AI 模式 `/x/main`（portal-template-default，本扩展宿主）、无代码模式 `/v/admin`（modern client 谱系界面搭建器）、移动端 `/v/mobile`、设置中心 `/settings`（门户管理/数据源/用户和权限/**工作流**/AI 员工/插件管理器/其他设置）。

- **设置中心 workflow 管理面存在**（/settings/workflow：列表/新建/配置入口；smoke 建的 CI countersign 正常显示，触发方式列 "approval"），但**新建工作流的触发器类型清单不含「审批」**（仅平台内置 6 种：操作前/后事件、定时任务、数据表事件、自定义操作事件、AI employee 事件）——证据截图 `docs/screenshots/v3-portal/E-probe-v3-settings-trigger-list.png`。设置壳未把插件 client lane 的触发器注册渲染进新建清单（加载机制待深查：通知管理插件页能进设置中心，说明插件设置页有通道；差异在触发器注册走 workflow client 上下文）。
- **/v/admin 无 workflow 路由**（/v/admin/workflow/list → 404）。
- **结论（E 面 43 项判定修正）**：v3 上审批工作流当前**无任何 UI 可创建/配置**，API 建流为唯一路径（smoke 铁证）。E 面 portal-rebuild 判定成立——审批工作流配置 UI 由 portal 扩展自建（配置表单消费 workflows/flow_nodes API）；settings-center 插件页通道为备选（机制待查）。G 面通知模板页归属：v3 设置中心已有「通知管理」（notification-manager），G 面 portal 侧等价页待批5 处理。
