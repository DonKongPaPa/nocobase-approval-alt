# Changelog

本项目使用独立版本线（`1.0.0-beta.x` → `1.0.0` → `1.x.y`），与对齐的宿主 NocoBase 版本无关；宿主兼容性由 peerDependencies 表达，每个版本条目首行注明当时对齐的目标（本地宿主版本 + 官方 demo 版本）。

## 格式规范

本文件遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本（[SemVer 2.0.0](https://semver.org/lang/zh-CN/)），并做如下项目化定制：

### 版本号

- `MAJOR.MINOR.PATCH[-预发布]`：行为对齐目标变化升 MINOR 并在条目注明新目标；仅缺陷修复升 PATCH；预发布用 `-beta.N` 递增。
- 发布顺序：变更先累积在 `## [Unreleased]`，发布时拷出为 `## [版本] - YYYY-MM-DD`（ISO 日期），打 tag `v<版本>`，`npm pack` 产物入上层 `artifacts/`，并在条目尾部追加一行「验证」记录该次发布跑过的验证（构建/部署/兼容检查/E2E）。

### 分类（固定七个，按此顺序）

| 分类 | 收什么 |
| --- | --- |
| `### Added` | 新功能、新端点、新模型（注明服务端 / 客户端 v1 / 客户端 v2 哪一侧） |
| `### Changed` | 既有行为的变化 |
| `### Fixed` | 缺陷修复（写症状 + 根因，可对照验证） |
| `### Removed` | 移除的能力 |
| `### Breaking` | 破坏性变更（升级前必读；含部署机制、包名、宿主版本要求变化） |
| `### Engineering` | 工程化变更：构建、打包、文档、规范、版本管理——不影响运行时行为 |
| `### Known deviations` | 与官方插件的已知差异与范围取舍——**本项目特有分类**，行为差异在此登记后不应作为 bug 重复报告；逐项细节链接到 docs/08、docs/09 |

### 书写规则

- 每条一行、一个可验证的事实；禁用「优化」「完善」「调整」等无法对照的措辞。
- 涉及行为差异的条目给出证据出处（docs 章节 / wire 铁证），或直接引用官方对照结论。
- 环境怪癖修复（如本机 users 仓库 filterByTk 错行）写进 Fixed 但注明「本环境」限定词。
- 条目内不复制 docs 正文，链接过去即可。

## 版本历史

## [Unreleased]

（未收口的变更累积在此）

## [1.0.0-beta.2] - 2026-10-24

行为对齐目标：宿主 NocoBase 2.4.0-alpha.9；对照基准官方 demo alpha.12（2026-10-22 build）。
本版主体：仿真矩阵驱动的行为对齐（7+1 类）+ 浏览器拟真仿真补充轮 + v3 AI portal 前端扩展。

### Breaking
- 移除客户端 client-v2 lane（分支 `feat/v3-ai-portal`，为 v3 AI portal 适配做准备）：包不再含 `client-v2.js` 标记与 `dist/client-v2/`，2.4 modern 宿主的审批中心双列表/任务卡/表单/时间线/配置面板 UI 不再由本插件提供；宿主侧这些能力由 v3 AI portal 扩展复现（施工规格见 docs/13）。v1 lane（schema UI 兜底）、server、locale 不变
- 宿主加载面变化（v3 实证，docs/13 附录 A③）：v3(3.0.0-alpha.13) 与 2.4 lane 机制同构，去标记后插件仅进入 client lane 清单，v1 兜底照常注册

### Removed
- 删除 `src/client-v2/`（18 文件 ~10,300 行：审批中心双列表、任务卡五操作、表单模型、时间线、触发器/节点/画布/通知组配置面板、审批人界面配置器、注册基建）、根 `client-v2.js` 标记、`dist/client-v2/` 构建产物；全量功能点标记留档 docs/13（317 项，292 portal-rebuild）

### Engineering
- `scripts/build.js` 去 client-v2 lane（4→3 lanes：server + client + externalVersion）；`package.json` files 白名单与 scripts 同步收缩；`dev-restart.sh`、`tools/ci.sh`（tgz 白名单）、`tools/ci-smoke.mjs`（静态资产关）同步去 v2 断言

### Fixed
- 仿真矩阵轮（tools/sim-approval-matrix.mjs，13 场景双端对比 vs alpha.12 demo，docs/13）修复 7 类行为差异：①or-sign/投票出结果后余票 record 重打 UNPROCESSED(3)（旧 demo 0 语义已被 alpha.12 取代）；②拒绝（含分支 endOnReject）核心 job+execution 写 -5（原 1/-1）；③撤回删除开放 records（原留 -2）且核心 job 写 -4、载荷 records:[]；④转签/加签补两级校验——候选人名单（Assignee is invalid.）与节点 actions 白名单 8/99（Delegate/Add action is not allowed for this node.）；⑤退回指定节点改原位复用（record 重指目标节点、job 重置 0——原 RETURNED 残留+-6+rerun）；⑥mode 0 空壳业务记录携带申请人 createdById/updatedById（变量审批人/官方载荷快照依赖）；⑦宿主 variable.resolve 返回空/垃圾时按数值验证兜底简单解析器（变量审批人曾解析为空）
- core job result 载荷对齐官方富形态：{status: 动作值/auto 审批值, data: 业务记录全量快照, records:[{id,status,userId,comment}], updatedAt 仅重打戳余票携带}；移除 _route 内部标记
- 无目标退回误终态为通过（浏览器仿真轮 S4 捕获，docs/10 §11.2）：`approvalRecords:return`（不带 returnToNodeKey）后 approval 直接 4 APPROVED——resume() 只读 result.status(=0) 交给 route() 落入 APPROVED 分支；现 action 层已置 RETRY_NEEDED 的 job 直接透传，approval 正确 RETURNED(1)/execution -6，重提后新轮次（S4b 全链+库级三断言复验）；退回轮核心载荷同步官方决定态形态 {status:1,data,records:[退回记录]}（原误用 returnToNode 的 {status:0} 重置形态）；return 的 comment 改原样入库（official echo 原始值，字符串不留 {text} 包装）；resubmit（approvals:update）把提交的 data 写回业务记录行（官方 round2 快照同 dataKey 带新值——原只写 approvals.data 导致新轮 dataBefore 残旧，矩阵 SIMA6 快照 title 差异暴露）。同轮修正 sim 工具 SIMA6：改走 ：return 端点+中间态断言（旧脚本 submit status 1 两端端态巧合致假阳性 IDENTICAL）

### Known deviations
- 编译格式 filter 组审批人（{$and:[…]}）：官方 alpha.12 解析为空并 auto-approve 4 无 records（疑似上游回归）；兼容实现保留解析能力（用户要求的嵌套条件分组能力），登记为有意不跟随（docs/13 SIMA11）

### Engineering
- 新增审批仿真矩阵 `tools/sim-approval-matrix.mjs`（13 场景双端对比引擎，wire+载荷双通道取证，SIMA11 偏差标记机制）——固定 T 剧本的组合化补充；判定门见 skill nocobase-plugin-reverse v0.4
- 新增部署验证 CI `tools/ci.sh` + `tools/ci-smoke.mjs`（仓库级，不随包发布）：build → npm pack（白名单校验）→ 临时宿主（钉版 fork 源硬链接拷贝 + 独立 postgres 容器）→ tgz import + SQL 启用 + 热重启进程断言 → 九关冒烟（依赖兼容/双 lane 静态资产/会签 E2E 终态 APPROVED/错误日志扫描）→ 自动拆除；跑完即清，`--keep` 留场调试。设计与历史事故映射见 docs/11
- CI 产物归档定址 `~/approvals-ci-archive/<ts>/`（ci.log/report.json/tgz），自动轮转保留最近 20 轮全绿+全部失败轮，脱离 /tmp 临时区
- CI 临时环境每次运行时活读主环境（approvals-reverse）`applicationPlugins` 启用状态并整表镜像（双向、排除 workflow-approval 本身、缺件跳过并告警），主环境后续启停插件自动跟随，无需改 CI
- 新增仓库根 `CONTRIBUTING.md`：接手指南（日常命令、记录与日志归档索引 L1-L4、十条工程铁律、文档地图、发布流程）

### Fixed
- 补注册 `approvals:listRelated`（filter {dataKey,collectionName}）：v2 客户端 RelatedApprovalsModel 一直调用但 server 缺注册（404），docs/13 F17；v3/v2 双环境验证通过

### Engineering
- `dev-restart.sh` 增加进程换新断言：restart 后进程 etimes 异常即 `pm2 delete` + `nb app start` 强拉（docs/08 坑 #1 的机器防线，2026-10-21 现行犯实测）

### 验证
- 行为矩阵（13 场景双端对比）：**totalDiffs=0**（12 场景 MATCH + SIMA11 登记偏差），报告 api-captures/sima-report-*.json
- 部署验证 CI 六轮全绿（内置插件兼容门生效；末轮归档 tgz sha256 8d3f694c…）
- 浏览器拟真仿真（v3 portal 三账号，docs/10 §11）：S0-S5 + S4b 全链 PASS（含退回→RETURNED→重提→round2→APPROVED 的库级三断言）
- 干净构建 + 打包白名单校验 + tgz 关键文件断言通过

## [1.0.0-beta.1] - 2026-10-14

首个 beta。行为对齐目标：宿主 NocoBase 2.4.0-alpha.9（本地 lm fork），官方 demo 2.4.0-alpha.10。

### Added
- 服务端：`approval` 触发器 + `approval` 指令（会签/或签/依次、退回、加签/转办、多轮审批）；六张 collections；`approvals`/`approvalRecords` 全套 actions（create/withdraw/return/delegate/add/reassignees）；`workflows:listApprovalFlows`
- 通知：节点级 todo 组（按 PENDING 记录逐人发送）、触发器级 done 组（发申请人）；经 plugin-notification-manager Handlebars 渲染；内置渠道 + 默认模板种子
- 客户端 v1 lane：workflow-v1 画布的审批节点配置 UI
- 客户端 v2 lane：任务中心 apply/todos taskType（含刷新、筛选、发起新申请抽屉）、审批详情基类、审批页模型、审批时间线、通知字段集、表单模式模型；registerModelLoaders 懒加载 + registerCollections

### Engineering
- 结构规范化为标准插件布局：服务端与 locale 源码归位 `src/`（此前只有 dist 产物），`dist/` 全部由构建生成
- 统一构建 `scripts/build.js`：两条 UMD 客户端 lane + server/locale 原样拷贝 + 产物完整性校验；构建生成 `dist/externalVersion.js`（pm 依赖兼容性检查快照，缺失即检查失败空表）
- 包元数据：独立版本号 1.0.0-beta.1、files 白名单、README/LICENSE(AGPL-3.0)/CHANGELOG/.gitignore；本格式规范落地

### Known deviations
- 紧凑皮肤（非官方 FlowEngine 渲染器的 D-3 先例复刻）、JSItemModel 沙箱、audienceType 服务端强制缺口、Print 按钮、alpha.10 侧栏每工作流列表等范围取舍——逐项见 docs/08-ui-creation-parity.md、docs/09-ui-full-audit.md。

### 验证
- clean build（删 dist 重建）+ 产物完整性校验通过；dev-restart 部署后静态资源 200、`pm:list` 注册 version=1.0.0-beta.1
- pm 依赖兼容性检查：`pm:get` isCompatible=true、20 行全 ✓
- E2E：发起（mode 0 直接提交）→ 会签双审 → approval status=4 → 申请人站内信 unread+1（custom 模板变量渲染正确）
- 发布物：npm pack tgz 逐字节校验；`nb plugin import` 落地验证通过（验证后删除 storage/plugins 副本）；干净环境（approvals-clean）安装验证见 docs/08 §10.2
