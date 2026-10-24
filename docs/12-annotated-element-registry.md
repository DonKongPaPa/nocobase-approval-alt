# 12 — 圈选元素注册表（annotation-first 比对）

> 方法规范（自本轮起固化）：**每个 UI 对比面必须产出两个绑定产物**——
> 1. 截图存证（官方原图 + 红圈圈选版）归档于本地研究材料，不随本公开仓分发；本篇保留文字注册表。
> 2. 本类注册表：编号 ↔ 官方元素 ↔ 兼容实现位置（文件:行）↔ 判定（对齐 / 缺口 F\* / 取舍 / 宿主 scaffold）。
> 判定必须有依据列（bundle 行号铁证 / 截图 / API 复核），不许凭印象写「一致」。此规范已写入 skill `nocobase-plugin-reverse`。

## 本轮：官方审批节点配置抽屉（截图本地归档）

原图与圈选图：本地归档（未随公开仓分发）。
该节点为**分支模式**（画布可见 Rejected/Approve 分支），Pass mode 单选呈官方灰禁态。

| # | 官方元素（截图） | 兼容实现 | 判定 |
|---|---|---|---|
| 1 | 抽屉头右上节点 ID chip `mf258bf4v4d` | 宿主 flow-engine 抽屉脚手架 | 宿主 scaffold，本地活体待核对（不属兼容实现职责，登记） |
| 2 | `Node type: [icon] Approval` 只读 chip | 宿主按 instruction 注册渲染；兼容实现 instruction 已带 title/icon（src/server/instruction.js） | 对齐（机制级） |
| 3 | 描述文案块（Manual approval operations…） | 同上，instruction description；文案对照 docs/05 | 对齐（机制级） |
| 4 | `Pass mode:` Passthrough/Branch 单选组，**灰禁**，每项带 `?` | fieldsets.jsx:720-729（Radio.Group disabled:true + Tooltip） | 对齐（官方同款灰禁实证）；`?` 图标缺失 → **F16** |
| 5 | `* Assignees:` 必填红星 label | fieldsets.jsx:730-746（required + validator） | 对齐 |
| 6 | `+ Add` 虚线添加按钮 | fieldsets.jsx:690-704（Popover + dashed Add） | 对齐 |
| 7 | 添加 Popover：`Select users` / `Query users` | fieldsets.jsx:698-699（选择用户 / 查询用户；查询用户=条件面板，嵌套分组已修 docs/08 §10.3） | 对齐（locale 差异属 zh/en 两条 lane） |
| 8 | `Negotiation mode:` Or/And/Voting + `?` | fieldsets.jsx:527-539 NegotiationRadio（或签/会签/投票 + NEGOTIATION_TIPS；投票选中出阈值输入框） | 对齐；`?` 图标 → F16；投票阈值官方形态未取证（既有 T14 留证项） |
| 9 | `Order:` Parallelly/Sequentially + `?` | fieldsets.jsx:757-764（并行/依次 + Tooltip） | 对齐；`?` 图标 → F16 |
| 10 | `End the workflow after rejection branch` 勾选框 + 说明 | fieldsets.jsx:778-789（config.endOnReject，`branchMode` 门控） | 对齐——官方铁证 `m = useWatch(["config","branchMode"])`（analysis/chunk617.beautified.js:1289、1456-1459），门控逻辑 1:1；截图可见该框正因本节点是分支模式 |
| 11 | `Approver's interface:` → `Go to configure`（蓝） | fieldsets.jsx:795-801（config.approvalUid + NodeInterfaceButton） | 对齐 |
| 12 | `My approvals card:` → `Go to configure`（白） | fieldsets.jsx:802-808（config.taskCardUid，extra 文案同义） | 对齐 |
| 13 | `Task title` 输入框 + 行尾变量图标 | fieldsets.jsx:817-830（config.title + VariableInput；useSame 时禁用并提示沿用触发器标题） | 对齐 |
| 14 | Footer `Cancel` / `Submit` | 宿主抽屉脚手架 | 宿主 scaffold |

另：官方 `Disable auto pass` 勾选框（forceManualApproval）本屏未出现——该节点未开自动通过，条件渲染；兼容实现 fieldsets.jsx:765-777 门控与官方 chunk617:1452-1455 一致（既有对齐项）。节点通知组（todo）在视口下方未截到，兼容实现已实现并双端验证过（docs/08 §9）。

## 核对结论

- **14 个圈选元素：11 对齐 + 3 宿主 scaffold（1 待活体核对），0 个行为缺口**。
- **新登记 F16**（低危视觉缺口）：官方协商/顺序/通过模式每个选项渲染 `?` 帮助图标（宿主 RadioWithTooltip 组件行为），兼容实现用裸 Tooltip 包 Radio 无图标 affordance。修法：Tooltip 内加 QuestionCircleOutlined 后缀（对齐官方视觉）。修前先核对官方 bundle 该图标的确切组件与位置。
- 此前怀疑的「endOnReject 显示条件不一致」经官方 bundle 铁证**排除**（同用 branchMode watch 门控）——圈选法的价值正在于把「看起来有差异」逼成「有依据的判定」。
