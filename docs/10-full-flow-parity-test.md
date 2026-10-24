# 10. 全流程双端拟真测试（2026-10-14 执行）

> 测试操作全部经真实浏览器 UI（登录表单拟真登录、DOM 拟真点击/输入）；API 仅用于两端同构 fixture 准备与状态佐证。每个行为全程录屏留证。录屏/截图：`docs/screenshots/full-flow/`。

## 一、动态检查项机制 + workflow 快检

预定义矩阵只定义**行为剧本**，不预设画面内容。检查项执行中动态派生：

### 全画面细节确认步骤（每个关键状态强制）
触发时机：提交前后/每次审批动作前后/通知到达后/每个 tab/抽屉弹窗打开/终态。六步：
1. 渲染稳定（网络空闲 + 关键 selector 出现）
2. 全控件枚举：DOM 遍历全部交互控件（role+名称+enabled+徽标+tooltip），含弹窗滚动区逐屏滚动枚举
3. 全信息区枚举：标题/状态 pill/时间线逐条目文字/字段标签+值/时间戳/空态文案
4. 视觉复核：全屏+滚动区逐屏截图
5. 双端同状态对照：两端各自枚举后结构化 diff（不拿一端当预期）
6. 登记：任一「一端有另一端无/异」→ 追加检查项（来源 `[discovered@T?-状态?]`）；枚举出的控件至少操作验证一次或登记不操作理由

### workflow 快检成员
模型 `opencode-go-chat/deepseek-v4.1-flash`，dynamic-workflows 每 Phase 一个 run。主会话浏览器编舞（串行）+ 材料落盘至 `/tmp/ff-check-queue/`；deepseek 子代理并行只读快检：画面枚举规范化+双端 diff、派生新增检查项、证据完备性核对、Phase 汇编。主会话终审后并入 §8 检查项账本。

### 挂载点横向枚举（Phase 3）
从宿主 bundle 契约枚举插件全部挂载槽（taskType.Actions/tabBarExtra、画布节点卡、单据区块动作、设置页），逐槽确认兼容实现内容存在可操作。

## 二、环境与角色
| | demo | 本地 |
| --- | --- | --- |
| 地址 | 早期对照 demo（已过期换址，经 `NOCOBASE_DEMO_URL` 注入） | 127.0.0.1:13800 |
| 宿主 | 2.4.0-alpha.10（team_a） | 2.4.0-alpha.9 |
| 申请人 | ff_applicant | 张申请 reapplicant |
| 审批人甲 | ff_appr1 | 王审批一 reapprover1 |
| 审批人乙 | ff_appr2 | 李审批二 reapprover2 |

## 三、Fixtures（两端同构）
集合 t_ff(title) ×1；工作流：W-会签（negotiation=1 甲乙）/ W-或签（=0 甲乙）/ W-依次（=1 order 甲→乙）/ W-多节点（审批→审批）/ W-表单（approvalUid 申请表单）；渠道 ff_channel + 节点 todo 组 + 触发器 done 组。

## 四、行为剧本
申请侧 T1 UI 直接提交｜T2 草稿→提交｜T3 撤回｜T4 退回→重提新轮次
审批侧 T5 会签全程｜T6 或签一票通过｜T7 依次门控｜T8 拒绝｜T9 退回指定节点｜T10 转办｜T11 加签后加｜T12 加签前加（探测）
UI/通知/边界 T13 任务中心枚举｜T14 投票探测｜T15 权限边界；通知验证内嵌 T1/T5/T8

## 五、执行记录
（执行中填充）

## 六、风险降级（已启用情况记录）
（执行中填充）

## 七、对齐矩阵终稿
（Phase 4 填充）

## 八、检查项账本（动态）
（执行中填充）

## 五、执行记录（2026-10-14 实跑）

### 5.0 环境修复（测试前置发现）
- **multi-portal 宿主插件 client-v2 崩溃**（`portalName` undefined）阻断本宿主全部 /v/ 页面渲染（含任务中心）——SQL 禁用后恢复。preset 自带插件（10-12 建库即有），崩溃为运行时状态依赖。
- 本宿主为 AI 工作区模板壳（Default Template v3.1.1，modern-only 入口）；v1 shell 仅「用户」页。

### 5.1 对齐矩阵

| 案例 | 行为 | 本地（兼容实现）结果 | demo/官方基准 | 判定 |
| --- | --- | --- | --- | --- |
| T1 | UI 直接提交 | 抽屉→卡片→表单→提交全拟真 ✓（approval 2、快照随单、52 卡分页） | 提交动作活体不可得（空间权限），状态/分配活体 ✓ | 对齐 |
| T2 | 草稿→提交 | DRAFT(0)→列表「草稿」→update→SUBMITTED(2) ✓；UI 无存草稿=紧凑皮肤取舍（F2b，官方默认隐藏+可配置） | update 链活体 ✓；官方默认形态静态铁证 | 对齐（取舍登记） |
| T3 | 撤回 | withdrawable 开启后 withdraw→0、record -2、round -4 ✓；UI tag 提交→草稿 ✓ | 同语义活体 ✓（demo execution -4） | 对齐 |
| T4 | 退回→重提 | return→1 RETURNED（UI「退回」）→update→新轮（旧轮 -6）→两级批→4 ✓ | return 动作活体不可得；重提链活体 ✓ | 对齐 |
| T5 | 会签 | 甲批→3 PROCESSING（乙仍 0）→乙批→4 ✓ | 静态（negotiation=1） | 对齐 |
| T6 | 或签 | 一票即过 4、乙保持 0 ✓ | 官方铁证「通过→其余保持 0」 | 对齐 |
| T7 | 依次 | 乙初始 null 未开→甲批乙开→4 ✓ | 静态（order） | 对齐 |
| T8 | 拒绝 | 甲 -1、乙 3 UNPROCESSED、approval -1 ✓ | 官方铁证 | 对齐 |
| T9 | 退回指定节点 | L2 return(returnToNodeKey=L1)→L1 同轮重开→重批两级→4 ✓ | 静态（P-E 语义） | 对齐 |
| T10 | 转办 | u4:8 DELEGATED+新 Delegated 记录→李批→4 ✓ | 静态（type=Delegated） | 对齐 |
| T11/T12 | 加签后/前 | Added 标记、前加乙先开、终态 4 ✓ | 静态（type=Added） | 对齐 |
| T13 | 任务中心 UI | 工具栏（宿主下拉+刷新/筛选/发起新申请）、筛选 8 态枚举+URL 参数+收窄+重置、tab 三态、角标 ✓ | demo 截图工具栏无宿主下拉（alpha.10） | 对齐（宿主下拉=alpha.9 壳行为） |
| T14 | 投票 | 0.5×2 人：1 票后仍 3（需过半） | 官方服务端闭源、活体不可得 | 静态对齐（留活体待证） |
| T15 | 权限边界 | 非审批人 403 / 重复提交 403（同文案防探测） | 官方同文案（历史行为测试） | 对齐 |

### 5.2 发现清单
- **F1（环境级）详情弹窗断链**：兼容实现行点击硬编码 `/admin/workflow/tasks/...`（v1 契约），AI 壳重写到 `/v/mobile/...`→404。已改兼容实现为 `/page/workflow-tasks/...`（最佳适配）；直接访问该路径详情渲染正确（时间线/状态/审批人 ✓）。根子=宿主壳 `useMobileLayout().isMobileLayout` 误判 + 路由形态漂移（标准 modern-only 的 clean 环境任务中心路由整体 404，更佐证壳差异）。修复方向留档：壳的 mobile 判定归因。
- **F2b（裁决：紧凑皮肤取舍，非缺陷）**：官方存草稿=hide:true 的可配置动作（chunk828 静态证据；ApplyFormSaveDraftModel 默认隐藏、配置开启才显示，兼容实现 patternFormModels 1:1 同构）。applyNew 紧凑表单不渲染可配置动作 → 一律无存草稿按钮，草稿经 API 可达。曾试加无条件按钮（UI 回归 DRAFT 0 落库✓）后按官方默认形态回退。
- **multi-portal 崩溃**（环境，已修复）：见 5.0。
- **demo 深度边界**：UI 活体 Network Error 不可达；member 账户被多空间权限拦（含用户级消息 API）；空间成员管理不可达 → demo 审批动作以官方静态+历史活体为基准（§八授权降级）。

### 5.3 挂载点横向枚举（机制驱动，防缺漏）
taskType apply/todos ✓（UI 活体）、Actions 槽 ✓（工具栏枚举）、Detail ✓（直接 URL 渲染正确）、registerModelLoaders ✓（T1 表单链）、registerCollections ✓、patternFormModels ✓（T1）、notificationsFieldset ✓（RE notify multi 通知全链）、registerTaskStatsProvider ✓（角标）、listApprovalFlows ✓（52 卡）、v1 fieldsets/triggerPageModels/approvalPageModels——历史轮验证（docs/09 §6-7），本轮未回归 UI（登记）。

### 5.4 证据
录屏：T1-local-applicant.mp4 / T4-local-return-resubmit.mp4 / T13-local-ui-enumeration.mp4（/tmp/cdp-rec-*/，转存见 screenshots/full-flow/）。截图：T1-local-apply-tab/drawer/apply-form、T2-local-draft-row、T13-local-filter-popover。材料与账本：/tmp/ff-check-queue/ + §8。

## 八、检查项账本（动态派生 + deepseek 快检终稿）

### F 编号注册表
| 编号 | 命题 | 判定 | 依据 |
| --- | --- | --- | --- |
| F1 | 详情弹窗断链（行点击 404） | 环境级（宿主壳 mobile 误判+路由形态漂移）；兼容实现已做最佳适配（/page/ 路径），直接 URL 渲染正确 | ffprobe/console/双环境对照（§5.2） |
| F2 | withdrawable 缺失致撤回不可用 | 撤销——interfaceConfig 已实现开关，RE chain lab 未开启属正确行为 | actions.js:178 + interfaceConfig.jsx:468 |
| F2b | 申请表单缺存草稿按钮 | 裁决：紧凑皮肤取舍（官方 hide:true 可配置动作，兼容实现模型类 1:1；曾加无条件按钮后按官方默认形态回退） | chunk828 静态 + patternFormModels:2088 |
| F3 | 重提后双 record 卡 PROCESSING | 撤销——RE chain lab 本为两级链，第二级待批是正确行为 | flow_nodes 表实证 |
| F4 | demo 撤回后 status 不变 | 撤销——响应快照时序误读，实际落库 0/-4 与兼容实现一致 | approvals:get 复核 |
| F16 | 审批节点配置项每选项缺官方 `?` 帮助图标（Pass mode/Negotiation/Order 共 7 处） | 待修（低危视觉 affordance；Tooltip 裸包无图标） | 圈选注册表 docs/12（官方配置抽屉圈选 #4/#8/#9，本地归档） |

### 快检派生检查项（deepseek v4.1 flash，账本草案全文见 docs/ledger-draft-phase12.md）
择要登记（流程性建议已按预算裁决采纳/搁置）：
- **采纳并已修**：F2b 裁决修正（快检质疑 → bundle 复核 → 回退无条件按钮）；demo-summary.json JSON 损坏重建；T6/T8 语义以官方铁证统一（通过保持 0 / 拒绝其余 3）。
- **登记为证据缺口**：T4/T13 录屏 1 帧空壳（ffprobe 实证；录制管线在页面静止期退化）——行为断言由 API+截图材料覆盖，T1 录屏（638 帧 106s）为有效代表样本；铃铛角标「1 vs 3」为不同时刻/账户快照（当前 API 未读=5，随行为累积，无矛盾）。
- **留档待后续**（不影响行为对齐结论）：T10 delegate/add 202 空响应体与官方格式对照；T14 投票阈值 > vs >= 活体对照；demo 侧 T5-T15 活体（空间权限解锁后）；材料 schema 补 openQuestions/evidence 数组；T2/T4 的 UI 通道补录（F1 修复后详情可从 /page/ 直达）。

### 快检运行信息
- run dwfrun-cb2755fd-3582-4aac-b204-7a412a8dd110，模型 opencode-go-chat/deepseek-v4.1-flash，3 阶段（材料快检×7 并行 → 证据完备性×3 → 账本汇编），tokens 24.3M，零失败。

## 九、demo 换址 v13 + 环境注入脚本（2026-10-15）

官方 demo 过期换址：`<demo-base-url>/`（2.4.0-alpha.10.20261014064255，en-US；账号不变 admin@nocobase.com/<test-password>，basic 认证；多空间 team_a 结构保留；历史数据清空）。**v13 的 UI 活体恢复可用**（v10 末期 Network Error 不可达的问题消失）。

**环境注入脚本 `tools/reseed-demo.mjs`**：demo 每次过期换址后跑一遍即可重建全部对比 fixture。幂等设计（按稳定 name/title 先查后建，重跑=no-op）、空间头自适应探测、userId 动态回填节点 assignees、结尾自动冒烟（admin 提交→双审批人 record 分配断言）。产物状态写 `tools/demo-state.json`。用法：
```bash
node tools/reseed-demo.mjs                     # 默认 v13 地址
node tools/reseed-demo.mjs --base https://<新地址>.demo.nocobase.com
```
重建内容：集合 t_ff、账户 ff_applicant/ff_appr1/ff_appr2（<user-test-password>）、渠道 ff_channel、工作流 FF countersign（含 todo/done 通知组）/FF or-sign/FF sequential/FF two-node。已验证：一跑全绿、二跑幂等、冒烟分配 ✓。已知限制（v10 同款）：member 账户被多空间权限拦（审批动作/用户级消息 API），root 非审批人 403——demo 审批动作活体仍不可得。

**v13 UI 活体首批对照收获**（官方 UI 对照截图，本地归档）：
- 官方任务中心工具栏 aria 模板：`action-Action-Refresh-approvals-list` / `action-Filter.Action-Filter-approvals-list` / `action-Action-Apply new-approvals-list`（兼容实现用中文 aria——形态差异登记，alpha.10 无宿主「我的申请」下拉的结论继续成立）
- Apply new 抽屉活体：标题 Apply new、内层工具栏（Filter/Refresh，aria 的 resource 段为 `filter-workflows-list`/`refresh-workflows-list`）、卡片文本「Click to initiate approval」与兼容实现一致、列表项非 .ant-list-item 结构（v13 换了组件类名）
- 官方对无 approvalUid 工作流：卡片可点、modal 仅标题空壳（兼容实现为不可点+无效标记——对照差异登记）
- **官方 ApplyForm 活体首次完整拿到**（Quotation approval 自带申请表单）：文本/日期×2/关系选择器/markdown 富文本工具栏全套（含 Comment、设备切换 Desktop/Tablet/Mobile/Wechat、复制到公众号/知乎扩展）/Submit；modal 近全屏宽（1382 vs 兼容实现紧凑 800——D-3 紧凑皮肤取舍的官方基准更新）。此活体是后续 apply 表单逐控件对照的新基准。

## 十、依赖兼容性清单横向对比挖掘（2026-10-15，用户报告依赖出入大）

用户对比官方 v13 与兼容实现的「依赖兼容性检查」面板发现出入大。经 pm:get 全量拉取（36 vs 20 项）做精确差集：**官方独有 17、兼容实现独有 1（joi）、一致 19**（dnd-kit 双方都有——审批行排序实现一致，截图初读有误）。

### 10.1 差集归因（全部 18 项）

| 类别 | 项 | 定性 |
| --- | --- | --- |
| 渲染技术栈（7） | formily 全家桶（antd-v5/core/react/reactive/reactive-react/shared）+ antd-style | 官方配置 UI/申请表单 = formily SchemaComponent + antd-style 样式；兼容实现 = antd Form 手写（D-3 紧凑皮肤取舍）。**已知取舍的依赖面实锤，非新缺陷** |
| 官方宿主/测试依赖（9） | plugin-mobile、plugin-ui-schema-storage、plugin-acl、plugin-flow-engine、acl、actions、plugin-workflow-test、test、sequelize | 官方源码（含 tests/）import 的宿主内置插件与服务端包：①plugin-mobile=官方有移动端任务页（mobile.page.workflow.tasks，兼容实现无=取舍）；②plugin-ui-schema-storage=v1 uiSchema 存储路径；③plugin-*-test/test=构建机扫描含测试套件；④其余=官方服务端直接 import 宿主包（兼容实现用 this.app.* 宿主注入，等价） |
| 工具（1） | lodash | 官方源码工具；兼容实现 esbuild external 过滤后实际未直接 import |
| 兼容实现独有（1） | joi | 兼容实现服务端参数校验显式依赖；官方服务端闭源无对照——登记 |

### 10.2 依赖差异映射的功能面对照（v13 活体取证）

对 Quotation approval 自带申请表单（首个官方 ApplyForm 活体）逐字段枚举 + 行为探针：

| 功能面 | 官方活体行为 | 兼容实现现状 | 处置 |
| --- | --- | --- | --- |
| 字段分组卡 | 表单按分组卡分节（Quotation/Customer/Items/Totals/Remark） | 无分组，平铺 | 取舍登记（紧凑皮肤） |
| hasMany 子表 | Items 子表通栏（第六轮已登记同款） | 无子表 | 取舍登记 |
| 富文本 | Remark=vditor markdown（含 Desktop/Tablet/Mobile/Wechat 预览模拟、复制到公众号/知乎——**非设备切换**，初读已修正） | 普通输入框 | 取舍登记 |
| 必填校验呈现 | Customer 必填星号；空提交**无前端错误提示、modal 不关、静默不落库** | antd Form.Item 红字校验提示 | 兼容实现 UX 反而更明确——保持，登记 |
| 字段级联 | Customer 选定后 Contact 仍列全部 22 客户（该工作流无级联配置） | 同为平铺无级联 | 行为一致 ✓ |
| modal 宽度 | 800（此前 1382 系 vditor 全屏态误读） | 800 | 一致 ✓ |
| 通知组/暗色/其余 19 项一致依赖 | — | — | 对齐 ✓ |

### 10.3 结论

依赖出入 = ①渲染技术栈差异（formily vs antd，已登记的 D-3 取舍的依赖面实锤）+ ②官方源码的宿主/测试 import（构建扫描口径天然差异）+ ③兼容实现 joi（合理选择）。**未发现新的行为级缺陷**；本轮嵌套 filter 三层修复（§10.3 前节）后，依赖差异所映射的功能面已全部有活体对照结论。

## 十一、干净部署后浏览器仿真轮（2026-10-23，v3 portal @13810）

> 背景：API 仿真矩阵轮（docs/13）13 场景 IDENTICAL + 干净部署 CI 两轮全绿后，按「固定断言全绿≠完全一致」判定门，在真实用户界面（v3 AI portal，三账号拟真登录、DOM 拟真点击）复演全链路。截图：`docs/screenshots/v3-portal-sim-20261023/`。
> 部署面：CI round1/2（九关全绿，内置插件兼容门生效）→ **v3 环境插件服务端陈旧构建检出并换新**（四文件 md5 全不符，正是坑 #36 在 v3 复现）→ 13800/v3 双端同步最新构建（fresh pid + md5 断言）。

### 11.1 剧本与结果（请假审批流 v2：张三申请→李四组长→王五人事）

| # | 剧本 | 操作链 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| S0 | UI 发起+提交 | 表单拟真填写（类型/日期选择器/天数/事由）→ 提交 → 二次确认 | ✅ PASS：提交成功，列表新增「已提交」；库级 approval=2、待办指派李四 PENDING | S0-form-filled / S0-after-submit |
| S1 | 会签 L1 通过 | 李四待办→详情抽屉（时间线+五操作底栏）→ 通过（意见） | ✅ PASS：时间线带意见、流程推进 L2、相关审批「审批中」 | S1-lisi-todo-detail / S1-lisi-after-approve |
| S2 | 无 8/99 节点按钮面 | 王五详情：**底栏仅「通过/退回」**（人事备案节点 actions=[2,1]） | ✅ PASS：portal 已按节点 actions 过滤按钮显隐（强于服务端拦截toast预期；服务端两级门由 SIMA8/9 矩阵覆盖）→ 通过→终态 APPROVED | S2-wangwu-approved-terminal |
| S3 | 否决 | 李四否决（意见） | ✅ PASS：红「已拒绝」pill+时间线红+终态 -1 | S3-lisi-rejected |
| S4 | 无目标退回 | 王五退回（不带目标节点） | ❌ **真缺陷**：approval 误终态 APPROVED(4)、execution 1（应 RETURNED(1)/-6）→ 已修复，见 11.2 | — |
| S5 | 撤回 | 张三撤回 | ✅ PASS：撤回成功→状态回**草稿**、时间线仅 发起→撤回（无幽灵待办行）、「编辑并重新提交/删除」出现——官方撤回语义 | S5-zhangsan-withdrawn |
| S4b | 修复复验全链 | S0→李四通过→王五退回→张三重提（表单预填+「第 2 轮」时间线）→李四/王五 round2 双批 | ✅ PASS：approval=1 RETURNED、execution=-6、L2 job=-6+result{status:0}；重提新轮次 execution+李四新待办；终态 4 | S4b-zhangsan-return-returned |

其余佐证：提交与审批操作均有「该操作不可撤回，请确认后再提交」两级门；侧栏待处理角标随角色正确计数；SA 名下 2 条历史待办为旧批次遗留非幽灵。

### 11.2 捕获的真缺陷：无目标退回被误路由为通过（第 8 类修复）

**现象**：S4 中王五对 L2 执行退回（portal 走专用端点 `approvalRecords:return`，不带 returnToNodeKey），服务端把 approval 直接终态为 APPROVED(4)。

**根因**：`onRecordActed` 无目标退回分支按官方载荷契约把核心 job 重写为 `{status:0,data}` 并置 job=-6 后调 `plugin.resume(job)`；而 `ApprovalInstruction.resume` 只读 `result.status`（=0）交给 `route()`，0 落进 APPROVED 分支 → job RESOLVED → execution 1 → approval 4。

**为何 API 矩阵没抓到（重要教训）**：旧 SIMA6 脚本把 `status:1` POST 到 `approvalRecords:submit`——兼容实现 submit 只收 2/-1（400），官方走自己的分派路径；两端**端态巧合收敛**（脚本容错+随后的 approvals:update 重提），「IDENTICAL」对退回这一步是假阳性。**矩阵比过的只有断言里的字段，中间态没断言就没比过。**

**修复**（commit 本轮）：
- `instruction.js resume()`：action 驱动恢复时若 job 已带 RETRY_NEEDED 直接透传（不再按 result.status 重路由）。
- `sim-approval-matrix.mjs` SIMA6：改走 `approvalRecords:return`（官方客户端真实端点）+ 新增中间态断言 approval=RETURNED(1)。
- 退回轮核心载荷改决定态 `{status:1,data,records}`；return 的 comment 原样入库；resubmit 把 `values.data` 写回业务记录行（官方 round2 快照同 dataKey 带新值）——三处后续差异均由修正后矩阵逐层暴露并闭环。
- 双端重部署后 S4b 全链复验通过（11.1），API 矩阵回归另录（§11.4）。

### 11.3 观察项登记（非缺陷/待办）

| 项 | 观察 | 处置 |
| --- | --- | --- |
| O-1 详情抽屉日期显示 | 开始/结束日期显示 UTC 原文（`2026-10-25 16:00:00`），时间线用本地时区（`17:31`）——两种时区并列 | 显示层问题，双端同源逻辑，低危待办（对齐官方本地化渲染后复查） |
| O-2 `leave_requests:get` 400 | 王五会话抽屉刷新时业务记录接口报 `Invalid SQL column or table reference`（fork 的 fields 通道怪癖），抽屉降级用审批载荷渲染无感知 | 宿主怪癖非插件代码；portal 已优雅降级，登记 |
| O-3 按钮显隐过滤 | portal 客户端已按节点 actions 过滤转签/加签/否决按钮显隐 | 此前「可选跟进」已在批 7-11 实现，关闭 |

### 11.4 回归门

- API 矩阵（修正后脚本，demo+local+diff）终判：**totalDiffs=0**（12 场景 MATCH + SIMA11 登记偏差），SIMA6 含中间态与快照全对齐；报告 `api-captures/sima-report-*.json`。
- 干净部署 CI round3（含本轮修复构建）：`~/approvals-ci-archive/` 当轮 report。
