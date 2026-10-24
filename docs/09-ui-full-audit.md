# 09 · UI 全量比对审计（第四轮 · 2026-10-14）

> 本轮起因：用户指出「UI 特征比对的流程有瑕疵，语义记录不够仔细全面」，要求做一次完全的对比检查，
> 逐步截图对比所有实现细节；并现场反馈「modal 弹出逻辑有问题，且有差异」+ 要求 UX 行为录屏留证。
>
> 本文档 = 改进后的比对方法学 + 全量清单 + 逐项双端语义记录 + 差异修复台账。

## 0. 方法学（本轮与之前轮次的差异）

之前的比对以「看起来一致」收尾，语义记录没有落盘。本轮改为**四通道证据**逐项留痕：

| 通道 | 手段 | 落盘位置 |
| --- | --- | --- |
| 截图 | CDP `Page.captureScreenshot`（headless Chromium，1440/1728 宽） | 官方 UI 截图（本地归档） `audit-local/` |
| 录屏 | CDP `Page.startScreencast` → JPEG 帧序 → ffmpeg mp4（tools/record-cdp.mjs） | `audit-*/UX-*.mp4` |
| DOM 语义 | 页面内 eval：结构（组件类名链/列宽/gutter）、文案、标签颜色、按钮清单、溢出量 | 本章各节表格 |
| 行为 | 点击序列 + 点击后 DOM 状态探测（弹层数量/标题/路由变化） | 本章各节表格 |

判定分类（沿用项目总规则，措辞区分「范围取舍」与「做不到」）：

- **一致** —— 双端结构/文案/行为同构，列出证据。
- **差异（已修）** —— 发现并修复，附回归验证。
- **差异（待修）** —— 已定位未修，列修复方案。
- **版本偏移** —— 官方 demo 已升 2.4.0-alpha.10（本地 2.4.0-alpha.9），宿主级差异（插件 client-v2 bundle SHA 双版一致，插件代码无偏移；差异来自宿主）。
- **范围取舍** —— 官方有、兼容实现按紧凑等价实现，语义 1:1 但渲染皮肤简化（记录依据）。

## 1. 专项：任务弹窗弹出逻辑（用户现场反馈）

### 1.1 现象（用户截图）

兼容实现端「我的申请」点卡片后同时出现**两层弹层**：右侧 Drawer（标题=工作流名「分支加号验证」，
内容=状态/工作流 Descriptions）+ 中央 Modal（标题=「我的申请」，左内容右时间线）；Drawer 里时间线窄列
姓名逐字换行，Modal 底部横向滚动条。

### 1.2 复现与根因

| 步骤 | 结果 |
| --- | --- |
| 当前部署 bundle（23:02 构建，含 navigate 修复）全新加载，点卡片 | **单 Modal**，标题=工作流名，无 Drawer（DOM 探测 drawers=0, modals=1） |
| 关 Modal 再点另一卡片 | 依旧单 Modal（S2 干净） |
| 双端 bundle 取证 | 部署 dist mtime 23:02:23 > 用户截图时刻 21:06 → 用户页面跑的是**重建前旧 bundle**（旧版 Item 点击自开 Drawer 且伴随路由跳转 → 宿主 Modal 叠加 = 双弹层） |
| 结论 | 双弹层是**旧构建行为**，当前构建已消除；用户侧硬刷新即可 |

### 1.3 真实差异与缺陷（本轮逐一修复，均有回归验证）

| # | 差异/缺陷 | 官方证据（alpha.10 demo DOM/DB/代码） | 兼容实现修复 | 回归 |
| --- | --- | --- | --- | --- |
| 1 | 弹窗列宽 xl 70%/30% + gutter 8 | 官方 DOM：`--ant-col-xl-flex: 0 0 64%` / `0 0 36%`，col padding 8px（gutter 16） | `TaskDetailLayout` gutter [16,16]、xl 64/36 | 双端 DOM style 串一致 |
| 2 | 退回场景时间线 dot 恒为金色「待处理」 | 官方 demo 同场景 jobStatus=-6、dot=紫色圆形 tag `aria-label="Returned"`；官方把审批结果写入**核心 job 状态**（通过=RESOLVED/1、否决=-5、退回=RETRY_NEEDED/-6） | 服务端 `onRecordActed` 三分支显式写 `job.status`（1/-5/-6），`returnToNode` 废弃 job 也标 -6 | 新建审批走 通过：jobs.status=1（dot 绿「通过」）；走 退回：jobs.status=-6（dot 紫「退回」） |
| 3 | 审批意见显示 `[object Object]` | 官方 comment 存 jsonb 对象 | 集合列 `comment` text→jsonb（DB 已 ALTER 迁移）；客户端两处 Descriptions + 时间线引用块改对象感知渲染 | 退回写入 `{"text":"请修改金额再提交"}`，弹窗显示原文 |
| 4 | 弹窗标题「我的申请」（用户截图） | 官方 Modal 标题=工作流名 | 上轮已改为工作流名（本轮 DOM 复核：兼容实现「E2E basic」/ 官方「Order confirmation」一致） | 截图 L01 |
| 5 | Modal body 横向滚动条 | 官方 modal body 同样 sw>bw（1358>1350，Row gutter 负 margin 所致） | **不修** —— 官方同款行为（此前误判为缺陷） | 双端 DOM 溢出量记录在案 |

录屏证据：`UX-clone-popup-flow-before.mp4`（修复前）→ `UX-clone-popup-flow-after.mp4`（修复后）；
官方侧 `UX-demo-popup-flow.mp4`、`UX-demo-submit-flow.mp4`（官方发起表单→存草稿→列表 Edit→Submit 行为）。

### 1.4 官方侧结构性差异（待修，见 §3 B 组）

官方（我的申请/我的审批弹窗）左列是**卡片组**而非简单 Descriptions：

1. **业务记录卡**（Original application content）：按工作流任务卡片配置渲染业务字段
   （分组标题 Quotation info/Customer/Items + 字段栅格 + 子表分页），字段取审批快照。
2. **当前记录状态卡**（我的审批视图独有）：Status/Assignee/Processed at。
3. **Apply 卡**：发起人头像+昵称。
4. **当前节点卡**（每节点一张，标题=节点名 + 会签/或签 pill）：逐 job 行 = 头像+昵称+行内状态 tag
   （Unprocessed 为默认描边样式）+完成时间；仅渲染当前/最近节点，历史在右侧时间线。

兼容实现左列目前为紧凑 Descriptions（状态/工作流/申请人/申请时间/申请数据 JSON）+时间线。
这是**当前最大的 UI 差异**，修复方案与进度见 §5。

### 1.5 官方 demo 发起链路实测（附带发现）

- 官方模板「New quotation」页为 ApplyForm 风格整页表单（快照字段自动带出），但只有
  Save quotation draft/Preview/Reset，**无 Submit**；列表行 Edit 抽屉内的 Submit 仅做
  `quotations:update` 存盘（网络抓包证实），**不创建审批**。
- 直接 POST `approvals:create`（官方 v2 bundle 契约）在该 demo 被拒：`Data source "" not found`
  （多空间插件改写了数据源路由）。
- 结论：**该 demo 无可用的真实发起入口**，可操作弹窗（带 通过/否决/退回/委派/加签 按钮组+意见输入）
  的官方活体样本不可得；该面对比以官方 client-v2 bundle 代码（module 3557/828，已 beautify）为基准。

## 2. 比对清单总表

| 组 | 项 | 状态 |
| --- | --- | --- |
| A 管理端 | A1 工作流列表页 | 待比 |
| | A2 新建工作流弹窗 | 待比 |
| | A3 画布（触发器/审批节点卡/+按钮/工具栏） | 待比 |
| | A4 审批节点配置抽屉 | 待比 |
| | A5 触发器配置面板 | 待比 |
| | A6 发起界面搭建器（TriggerChildPageModel 树） | 待比 |
| | A7 申请表单配置（字段/操作/创建区块 + Submit 动作 clickSettings） | 待比 |
| | A8 审批界面搭建器（ApprovalChildPageModel + ProcessForm 动作组） | 待比 |
| | A9 我的申请卡片配置（ApplyTaskCardDetailsModel） | 待比 |
| | A10 审批任务卡片配置（ApprovalTaskCardDetailsModel） | 待比 |
| | A11 数据区块「发起审批」按钮（官方 gap #2 实测形态） | 官方实测：本 demo 数据区块无该按钮，模板走自定义页面（§1.5） |
| B 任务中心 | B0 弹窗弹出逻辑（专项） | 完成（§1） |
| | B1 任务中心页面结构/菜单 | 待比 |
| | B2 我的申请列表卡片 | 待比 |
| | B3 我的审批列表卡片 | 待比 |
| | B4 弹窗标题/Print | 官方=工作流名+Print；兼容实现=工作流名（Print 为 alpha.10 宿主能力，见 §4 版本偏移） |
| | B5 弹窗左右布局 | 已修（64/36+gutter16，双端 DOM 一致） |
| | B6 左列内容卡结构 | 差异（待修，§1.4） |
| | B7 时间线（dot/耗时/pill/轮次/转签/加签/撤回/终态） | dot 状态映射已修；其余上一轮已 1:1，本轮复核 |
| | B8 操作按钮组/意见输入（可操作弹窗） | 官方活体不可得（§1.5），以 bundle 代码为基准 |
| C 横切 | C1 i18n 词条抽查 | 待比 |
| | C2 版本偏移标注（alpha.10 宿主 vs alpha.9） | §4 |
| | C3 已知 gap 复核（通知渠道/audienceType/Print） | §4/§5 |

## 3. A 组·管理端明细

### A1 工作流列表页 —— 一致（宿主级差异记录）

| 项 | 官方（alpha.10 demo） | 兼容实现（alpha.9 本地） | 判定 |
| --- | --- | --- | --- |
| 列集 | Title/Category/Trigger type/Execute mode/Enabled/Executed/Actions | 标题/分类/触发方式/执行模式/启用/已执行/操作 | 一致（双端 DOM） |
| 行操作 | Configure/Edit/Duplicate/Delete | 配置/编辑/复制/删除 | 一致 |
| 工具栏 | Filter/Refresh/Delete/Add new | 筛选/刷新/删除/添加 | 一致 |
| 分类 | 彩点分类页签（Enterprise Hub/CRM/…） | 仅「全部」+ 加号 | **版本偏移**：分类页签为 alpha.10 宿主新增（workflow 分类功能） |
| 触发器 tag | approval 类型工作流 tag=Approval event | tag=审批事件 | 一致（同 bundle 词条） |

截图：官方（本地归档，未随公开仓分发） | [兼容实现](screenshots/audit-local/L10-workflow-list.png)

### A2 新建工作流抽屉 —— 一致

字段集双端一致：Name/Trigger type/Execute mode(异步·同步 radio)/Category/Description/
高级选项(Timeout settings/Maximum number of cycling triggers/Auto delete history…)。
触发类型下拉：兼容实现 7 项 vs 官方 8 项 —— 官方多 **Webhook event**（本地未装 workflow-webhook 插件，
宿主插件清单差异，非审批插件差异）。审批事件描述双端同文。

截图：官方（本地归档，未随公开仓分发） | [兼容实现](screenshots/audit-local/L11-workflow-addnew.png)

### A3 画布 —— 一致

- 头部：面包屑 Workflow/<名> + 执行方式 tag、Execute manually/Version #id/On/… ↔ 手动执行/版本 #id/启用/… —— 一致
- 只读黄条：Executed workflow cannot be modified… ↔ 已经执行过的工作流不能被修改…（同款）—— 一致
- 节点卡：Approval event/Quotation approval、Approval/Manager approval ↔ 审批事件/…、审批/经理审批 —— 一致
- 分支标签：Rejected(红)/Approved(绿)/Returned(紫) ↔ 拒绝/通过/退回（同色）—— 一致
- 未执行态：双端 5 个 + 按钮、结束圆点、X 汇合标记（兼容实现截图/官方 chunk S8 上轮已证）—— 一致

截图：官方（本地归档，未随公开仓分发） | [兼容实现](screenshots/audit-local/L12-clone-canvas.png)

### A4 审批节点配置抽屉 —— 结构一致；两处轻微差异

| 项 | 官方 | 兼容实现 | 判定 |
| --- | --- | --- | --- |
| Node type 行 | Approval + 描述 | 节点类型: 审批 + 同文描述 | 一致 |
| Pass mode | Passthrough/Branch | 直通模式/分支模式 | 一致 |
| Assignees | 用户行（只读态无拖拽柄） | 用户行（拖拽柄+x+删除+添加按钮） | 一致（只读/可编辑状态差） |
| Negotiation | Or/And/Voting | 或签/会签/投票 | 一致 |
| Order | Parallelly/Sequentially | 并行/依次 | 一致 |
| End after rejection | checkbox + hint | 同款 | 一致 |
| Approver's interface | Go to configure（无 uid 文本） | 进入配置 + **前缀显示 approval_uid** | 差异（轻微，兼容实现多显 uid） |
| My approvals card | Go to configure + hint | 进入配置 + hint | 一致 |
| Task title | 变量输入（默认 Approval） | 同款（默认 审批） | 一致 |
| Todo notifications | Approval notification/Template/Approval todo 三 select | 同构（抽屉底部） | 一致 |
| **抽屉标题** | 节点标题（Manager approval），key 徽章独立右上 | **「审批fedulut3geg」—— 节点标题缺省时拼了 node key** | 差异（待修 D-1） |
| 交互 | 点节点卡任意处开配置 | 点类型 chip 才开配置，点卡身仅选中 | 差异（待修 D-2） |

截图：官方（本地归档，未随公开仓分发） | [兼容实现](screenshots/audit-local/L14b-approval-node-config-clone.png)

### A5 触发器配置面板 —— 沿用上轮双端截图证据（docs/08 §2 步骤 9）

官方 demo 全部工作流已执行（只读），触发器卡点击不展开配置（活体不可得）；
兼容实现 TriggerFieldsetLoader 与官方 chunk 的 1:1 对齐已有双端截图（数据表只读显示/触发方式/发起位置/
谁可以发起/发起界面/我的申请卡片/记录显示方式/预加载关联）。

### A6–A10 界面搭建器 —— 沿用上轮双端证据（docs/08 §4 第二轮 1:1 复刻验证）

模型类语义 1:1（本轮未发现新差异）；重型列表/详情皮肤为已记录的范围取舍（§1.4 的 B6 修复将收敛其中
任务弹窗部分）。

### B1 任务中心页面结构 —— 差异（D-6）

| 项 | 官方 | 兼容实现 | 判定 |
| --- | --- | --- | --- |
| 侧栏结构 | My applications(3) / All workflows{子工作流} / My approvals(2)，申请在首位 | 我的人工任务{全部工作流,子工作流} / 我的申请 / 我的审批 | 差异：分组与排序不同（D-6） |
| 页签 | Pending/Completed/All | 待处理/已完成/全部（人工任务页同构） | 一致 |
| 工具栏 | Refresh/Filter/**+ Apply new** | 刷新/筛选（**无 Apply new**） | 差异（D-6）：缺发起按钮 |

截图：官方（本地归档，未随公开仓分发） | [兼容实现](screenshots/audit-local/L20-todos-list.png)

### B2 我的申请列表卡片 —— 差异（D-3 族）

- 官方：卡头=工作流名；正文=关联摘要（ORD-… · Microsoft）+ 任务卡配置字段两列栅格
  （Status 带图标 tag/Total amount/Quotation date/ID/Created at/Last updated at）。
- 兼容实现：三行紧凑卡（工作流名 + 状态 tag + `#dataKey · createdAt`）。
- 根因同 B6：官方列表卡由 `ApplyTaskCardDetailsModel` 配置驱动；兼容实现为紧凑等价皮肤。范围取舍 → 本轮升级为待修 D-3。

### B3 我的审批列表卡片 —— 差异（D-3 族）

- 官方：卡头=工作流名 + 右侧节点名 tag；正文=关联摘要 + ID/Status(金色 Pending)/Comment/Created at/Last updated at。
- 兼容实现：三行紧凑卡（节点名 + 待处理 tag + `approval #id · node #id`，测试数据无业务摘要时显示原始 id）。

### B7 时间线复核（本轮样本） —— 已对齐

本轮新建审批实测：发起 dot 绿（Initiated successfully/发起成功 同 aria 语义）、通过 job dot 绿、
退回 job dot 紫（aria=退回，job.status=-6）、会签 pill（ant-tag-borderless 同款）、
行内状态 tag 同色映射（通过绿/退回紫/待处理金）、耗时 dayjs 相对时间（几秒/N 小时）—— 双端一致。

## 4. C 组·横切与版本偏移

- **宿主版本**：官方 demo 2.4.0-alpha.10（build 20261012115952），本地 2.4.0-alpha.9。
  插件 client-v2 bundle SHA 双版一致（main `7bc597ed…`，chunk733 `1b7fb96f…`）→ 插件 UI 无版本偏移；
  宿主级差异（任务弹窗标题栏 Print 按钮、页面框架细节）标注为**版本偏移**，兼容实现跟随 alpha.9 宿主契约。
- **Print 按钮**：官方 alpha.10 宿主在任务弹窗标题栏提供 Print；alpha.9 宿主无此插槽。范围取舍：待宿主升级后自然获得，或兼容实现自绘（记录为可选项）。
- **审批记录状态值语义（更正）**：初判「兼容实现 1 vs 官方 0」系审计映射表错误；两端枚举一致（§5.1 D-4）。
  真实差异（退回其余人=3、通过其余保持 0）已修并回归。
- **已知 gap 复核**：通知渠道（gap#3）、audienceType 服务端强制（gap#4）本轮未变。

## 5. 差异修复台账（本轮）

| # | 修复 | 验证 |
| --- | --- | --- |
| 1 | TaskDetailLayout gutter[16,16] + xl 64/36 | 双端 DOM style 一致 |
| 2 | 服务端 onRecordActed/returnToNode 写核心 job 状态（1/-5/-6） | DB jobs.status 实测 1 与 -6；dot 绿/紫 |
| 3 | approvalRecords.comment text→jsonb（集合定义 + DB ALTER） | 退回写入 JSON 对象，弹窗渲染原文 |
| 4 | 客户端 comment 对象感知渲染（时间线引用块 + 两处 Descriptions） | 截图 L01，无 [object Object] |

### 5.1 待修清单闭环（第五轮执行结果，2026-10-14）

| # | 项 | 结果 |
| --- | --- | --- |
| D-1 | 节点配置抽屉标题缺省时拼 node key（「审批fedulut3geg」） | **版本偏移（宿主）**：标题拼接在宿主 alpha.9 workflow canvas NodeConfigDrawer 内部，插件 bundle SHA 双版一致（main `7bc597ed…`）证明非插件行为；alpha.10 宿主已改。节点有 title 时显示正常。不修（跟随宿主）。 |
| D-2 | 点节点卡任意处打开配置（官方 alpha.10 行为；alpha.9 需点类型 chip） | **已修+验证**：ApprovalCanvasComponent 外包 capture 阶段 click 转发（只读标题输入框不拦截），命中 chip 代为打开。非分支节点宿主不挂 ComponentLoader（Node.d.ts「self-render for branch nodes」）→ 该场景维持宿主行为。验证：分支画布点卡身空白处开出配置抽屉（真实坐标点击）。 |
| D-3 | 弹窗左列卡片结构（业务记录卡+状态卡+Apply 卡+当前节点卡） | **已修+验证**：新增 `models/taskDetailCards.jsx`——BusinessRecordCard（按集合字段自动渲染，enum→Tag/日期/千分位/关联 title/hasMany→分页子表；快照缺关联时按 trigger appends 取实时记录补齐）、RecordStatusCard（Status/Assignee/Processed at）、ApplyCard、TaskNodeCard（最新 jobId 分桶，行=UserChip+状态 tag+时间+意见引用块，negotiation pill）；列表卡升级 TaskCardFields（任务卡 items 渲染：flowModels 全表分页建树缓存，fieldPath 绑 approvals 列/data.* 业务快照，官方 metaTag 带 icon，JSItem 沙箱块为范围取舍）。对照官方 dump：todos 弹窗四卡、apply 弹窗三卡、列表卡（状态 tag/ID/Created at/Last updated at+任务卡字段）双端同构。官方「分组标题（Quotation info 等）」是 demo 集合私有区块配置，非通用元数据，不复刻（记录）。 |
| D-4 | record 状态值 | **审计澄清+局部修正**：兼容实现 server/client 枚举本就与官方一致（module 358：PENDING=0/RETURNED=1/APPROVED=2/UNPROCESSED=3/REJECTED=-1/CANCELED=-2/WITHDRAWN=-3/DELEGATED=8/ADDED=99；审批 DRAFT=0/RETURNED=1/SUBMITTED=2/PROCESSING=3/APPROVED=4/REJECTED=-1）——此前审计误用自造映射表读数。真实差异：退回时未动审批人官方标 UNPROCESSED(3)（demo 铁证 Alice=3）、通过时未动者保持 PENDING(0)（demo 铁证两行 Pending），兼容实现原实现全员盖 RETURNED/APPROVED。已修 stampRemainders（通过→不动、退回/否决→其余 3）。回归：或签双审批人实测——通过：行动者 2/其余 0/approval 4/job 1；退回：行动者 1/其余 3/approval 1/job -6，与官方 demo 值逐项一致。 |
| D-5 | 审批界面行多显 uid 前缀 | **已修+验证**：NodeInterfaceConfigButton hideUid 默认 true（含主 return 分支遗漏处）。验证：节点配置抽屉「审批界面」行仅剩「进入配置」按钮，与官方一致。 |
| D-6 | 任务中心菜单分组/排序 + Apply new 按钮 | **版本偏移（宿主帧）**：任务中心侧栏与列表工具栏由宿主 task center frame 渲染（alpha.9：平铺类型菜单+刷新/筛选；alpha.10：类型分组+工作流子菜单+Apply new）。插件侧不可达（bundle SHA 一致铁证）。Print 按钮同族。 |

第五轮新增修复（本轮发现的本轮缺陷，均已修+回归）：

- 服务端 `onRecordActed`/`returnToNode` 写核心 job 状态（通过=1/否决=-5/退回与废弃=-6）——时间线 dot 与官方同色同语义（已在上轮专项修复，本轮回归复验）。
- `approvalRecords.comment` 列 text→jsonb + 客户端三处对象感知渲染（[object Object] 消除）。
- `fetchCollection` 兼容 `data.values.fields` 仓库形态（老坑在渲染器中复发点）。
- 列表卡 appends 扩为 `workflow`/`approval.workflow`（任务卡 uid 读取需要 workflow.config）。

## 6. 交互控件全量比对（第六轮方法学升级，2026-10-14）

用户指出：功能调研深度不足，必须**逐个可交互控件做语义对比**；样式差异要用**计算样式比对**而非肉眼。

### 6.1 方法学（v2）

1. **控件清单先行**：对每个比对面，先用 DOM 枚举全部可交互控件（button/input/textarea/select/checkbox/radio/switch/menu-item/drag-handle/clickable），生成控件清单（标签/类型/数量/禁用态/选项集）。
2. **双端同状态枚举**：官方与兼容实现驱动到同一状态后各自枚举，先比**清单差异**（缺失/多余/禁用态不一致），再比**计算样式**（getComputedStyle：宽高/内边距/颜色/字号），最后才用截图做根因确认。
3. **行为通道**：对每个控件执行一次交互（点击/展开），记录响应（弹层内容/状态变化/请求），与官方对齐。
4. 命中差异 → 修复 → 用同一清单回归归零。

### 6.2 检查清单（本轮覆盖面）

| 面 | 可交互控件 |
| --- | --- |
| 审批节点配置抽屉 | 通过模式 radio×2 / 审批人行（拖拽柄·用户选择·变量输入·条件组面板·行删除）/ 添加按钮（选择用户/查询用户）/ 协商模式 radio×3 / 顺序 radio×2 / 拒绝分支结束 checkbox / 审批界面·进入配置 / 我的审批卡片·进入配置 / 任务标题变量输入（含变量选择器弹层）/ 待办通知 select |
| 触发器配置面板 | 数据表级联 / 触发方式 / 发起位置 / 谁可以发起 / 发起界面·进入配置 / 我的申请卡片·进入配置 / 快照模式 radio / useSameTaskTitle checkbox / 任务标题变量输入 |
| 变量选择器弹层 | 组清单（空值/常量/局域变量/**触发器变量**/节点数据/系统变量/变量和密钥）+ 触发器变量三级（工作流名 → nodeTitle/title/status/data.业务字段/records 五字段） |
| 任务弹窗（我的申请/我的审批） | 列表卡点击 / 弹窗关闭 / 撤回·删除（申请视图）/ 意见输入 + 通过·拒绝·退回·委派·加签（审批视图）/ 时间线卡片点击 / 窄屏 Tabs / 分页 |
| 画布 | 节点卡点击开配置 / + 添加按钮 / 分支标签 / 复制·删除菜单 / 手动执行 / 版本下拉 / 启用开关 |

### 6.3 本轮清单比对发现与处置

| # | 差异（用户反馈+清单比对） | 根因 | 处置 |
| --- | --- | --- | --- |
| K-1 | 审批人「查询用户」组件缺失（官方行内=满足[所有]组内条件+添加条件/添加条件分组） | 上一轮按指示照搬 CC UserSelect 时丢了三态行编辑器（用户/变量/条件组） | **已修**：fieldsets AssigneesInput 行升级为官方三态（数字→用户选择、`{{...}}`→变量输入、filter 组→`AssigneesFilterPanel` 条件面板），添加=Popover[选择用户/查询用户]，users 集合从 flow-engine 全局实例取（抽屉在 FlowContext 之外）。持久化 `[1,{logic:"$and",items:[…]}]` 实测，重开渲染条件面板 |
| K-2 | 审批人行显示 `[object Object]` | 同上（filter 对象被 String() 塞进 UserSelect） | 同 K-1，重开无 [object Object] |
| K-3 | 变量选择器缺「触发器变量」组 | 官方触发器客户端类实现 `useVariables(config,node)` 钩子（宿主聚合器以 `$context` 根挂载），兼容实现触发器未实现 | **已修**：ApprovalTrigger.useVariables 按官方 module 7781 旁 D 函数 1:1 复刻（workflow.key 组：nodeTitle/title/status/data.业务字段(appends)/records 五字段；需 `getCollectionManagerAdapter` 适配器）。验证：任务标题变量弹层出现「触发器变量→任务卡片验证>」三级 |
| K-4 | 弹窗左上返回按钮与「原始申请内容」标题重叠 | 当前构建无法复现（新 tab 直开/窄屏均正常，DOM 无页级返回箭头）；用户环境疑为旧 bundle 残留（该状态=detail 内联渲染+宿主页级返回钮，即 modal 未打开的旧缺陷形态） | 待复现：如再出现请附 URL 与构建 hash（/dist/…/index.js?hash=…）；已留观测点 |
| K-5 | 待办通知：官方=渠道/模板/模板名三个 select，兼容实现=单个禁用 select | 通知渠道集成（既有 gap#3，notification 插件链路） | 维持已记录范围取舍 |

截图：[查询用户条件组](screenshots/audit-local/L34-assignee-filter-panel.png)（与官方图1同构）、[触发器变量组](screenshots/audit-local/L35-trigger-variables.png)。

## 7. 第七轮：站内信通知渠道双端验证（2026-10-14，K-5/gap#3 闭环）

官方取证（demo alpha.10 + chunk-931/483/617）：节点 notifications=todo 组（分配时通知审批人，LY 变量集）、触发器 notifications=done 组（完成时通知申请人，N5 变量集），同一 NotificationList 组件；渠道来自 notification-manager `notificationChannels`（in-app-message 类型），模板走 `approvalMsgTpls`（todo/done 两条内置种子，Handlebars `{{approval.*}}/{{applicant.nickname}}/{{statusText}}`）；服务端经 notification-manager send 落 `notificationInAppMessages`(unread)+`notificationSendLogs`+ws 推送，消息标题/内容 demo 实测逐字取证。

双端各建渠道 `re_verify_in_app` + lab 工作流实跑：**建渠道→TODO 消息→同意→DONE 消息→已读→未读计数** 八个验证点全通且消息文本双端逐字节一致（详见 docs/08 §9 对照表）。

兼容实现端新增/修复：

- 服务端 `dist/server/notifications.js`：sendTodo（节点入口+顺序门控开位）/sendDone（终态 4/-1/1）→ notification-manager send；afterStart 幂等种内置渠道 `approval-todo-in-app-message`（meta editable:true/deletable:false，与 demo 一致）与 Approval todo/Approval done 双模板（id/type/template 逐字段对齐）。
- 客户端 `models/notificationsFieldset.jsx`：NotificationList（禁用渠道下拉/Add channel/templateType 切换清空/template RemoteSelect/Custom 配置模板弹窗五字段/变量树=当前审批记录+申请人+触发器变量+系统变量）接入触发器 done 组与节点 todo 组，替换占位 Select。K-5 闭环。
- alpha.9 宿主坑（新增 memory）：antd 5.6 无 Flex/Space.Compact/ConfigProvider.useConfig；RemoteSelect 在 `@nocobase/client-v2` 而非 workflow 包；uuid 主键集合 update 必须 `filterByTk`（`filter={"id":…}` 静默 no-op 返回 200 {}）。

Demo 清理：lab 工作流/集合已删，渠道 `re_verify_in_app` 保留作证据。

## 8. 第八轮：审批人「查询用户」变量树缺「节点数据」（2026-10-14）

用户报告查询用户面板的变量选择器没有「节点数据」。双端取证与修复：

- **官方活体铁证**（demo 建 RE chain lab 双审批节点链，第二节点面板实测）：变量下拉 = Constant/Null/Scope variables/**Node result(节点数据)**/Trigger variables/System variables/Variables and secrets 全量树，「节点数据」子级 = 上游审批节点（RE first approval）。
- **根因（两层）**：①宿主「节点数据」($jobsMapByNodeKey) 根由**上游节点指令客户端类 `useVariables(node)` 钩子**产出（host module 4563：遍历上游节点调 `instruction.useVariables`，无产出则整根不出现）——官方 approval 指令类挂了 D 函数（`T(e,"useVariables",D)`，与触发器 G 同体：五字段 nodeTitle/title/status/data.业务字段/records），兼容实现指令类漏挂；②兼容实现 K-1 面板自拼 FilterGroup+`VariableFilterItem`，meta 取 `VARIABLE_ROOTS=['$env','$context','$system']` 过滤——官方实际用的是**宿主 `FilterDynamicComponent`**（module 1801 整套条件组编辑器，变量树全量）。
- **修复**：①index.jsx 提取 `approvalUseVariablesChildren` 共用构建器（触发器/指令共用；t 走引擎 t 带 `[approval, client]` ns fallback——修复五字段 label 回落英文），`ApprovalInstruction.useVariables(node)` 返回 `{value:node.key,label:node.title,children:L}`；数据表/appends 读工作流 config（官方 D 即读 workflow.config）；抽屉在 FlowContext 之外时 dataSourceManager 回落全局 flow-engine 实例。②patternFormModels `AssigneesFilterPanel` 改为委托宿主 `workflowClient.FilterDynamicComponent`（保留自拼实现作宿主缺导出兜底）。
- **本地回归**（RE chain lab 第二节点）：面板=满足[所有]组内条件+添加条件/分组；变量树=局域变量/**节点数据**/触发器变量/系统变量/变量和密钥；「节点数据→RE first approval→节点名称/任务名称/处理状态/审批后的数据/审批人处理记录」全中文可选。
- 官方 demo lab 已清理（工作流/集合已删）。附带收获：任务标题的宿主 WorkflowVariableInput 同源获得「节点数据」可选（此前同样缺失）。

## 9. 第九轮：方法学整改后全量重跑（2026-10-14，零新缺陷，预期枚举两度纠错）

按「机制驱动 + 预期枚举先行 + 锚定即活体 + 状态类覆盖」重跑变量树回归。结果：**兼容实现零缺陷**，本轮价值在修正两轮错误预期并固化机制契约。

**机制横向枚举（静态）**：官方 bundle 全文 `useVariables` 类挂载点仅两处——指令类 `T(e,"useVariables",D)` 与触发器类 `j(e,"useVariables",G)`；兼容实现端两处均已实现（订阅者清单 2/2）。第三消费点为通知模板 M/I（`baseVariables` concat 宿主 `useWorkflowVariableOptions`），本轮双节点侧实测六键全中（当前审批记录=工作流名称/单据编号/审批数据记录唯一标识/任务节点/任务名称/任务编号）、DONE 侧=状态+审批三键+宿主 concat。

**预期枚举两度纠错（最重要教训）**：
1. 错预期①「单节点无上游审批节点 → 无节点数据根」。真 oracle（demo 真实单节点工作流）：**节点数据根仍在，但是无子项叶子根**（不可展开）。兼容实现端（上游链为空的面板）形态逐点一致——叶子根由宿主静态根列表挂载、children 惰性来自聚合器，非兼容实现代码。
2. 错预期②「触发器条目会出现在节点数据下」。demo 第一轮 oracle 显示 Node result→[Trigger]，实为**我自己用 `flow_nodes:create` 造的假触发器节点**（approval 类型 node record）被聚合器当作上游节点喂给指令钩子——兼容实现端同机制同样显示（审批事件），两端一致，但都不是官方真实形态。**官方触发器是虚拟头，不是 flow_nodes 记录**（真实工作流首个审批节点 upstreamId=null）；聚合器沿 upstreamId 链行走，天然到不了触发器。

**对齐矩阵（查询用户面板「节点数据」根，双端活体）**：
| 场景 | 官方 demo | 本地兼容实现 |
| --- | --- | --- |
| 无上游审批节点 | Node result 叶子根 | 同（叶子根） |
| 双节点链 N2 | [首节点] | [RE first approval]→五字段 |
| 一级根集合 | Constant/Null/Scope variables/Node result/Trigger variables/System variables/Variables and secrets | 常量/空值/**局域变量**/节点数据/触发器变量/系统变量/变量和密钥（局域变量↔Scope variables 为 alpha.9↔alpha.10 宿主差异，非兼容实现范围） |

**宿主行为补充记录**：①已启用（enabled）工作流的节点配置抽屉整体置灰（与官方 demo「已执行工作流不可交互」同族宿主门控；regression 需用停用工作流）；②alpha.10 `flow_nodes:update` 强制校验 branchMode（alpha.9 不需要）；③工作流触发器画布卡=虚拟渲染，配置抽屉照常可开。

**回归运行须知**：变量树预期枚举必须先经官方 oracle 校准再 diff 本地；建 lab 工作流严禁用 flow_nodes:create 造「触发器节点」（假节点会被聚合器吃进节点数据）；浏览器 bundle 新鲜度用 sha256 比对 served bytes vs dist。

清理：demo oracle 工作流已销毁；本地临时 RE single lab（含假触发器）已销毁；notify lab 恢复启用态。
