# Contributing Guide（接手指南）

> 本仓库是 NocoBase 付费「审批」插件（plugin-workflow-approval）的**行为级 clean-room 兼容实现**工程。
> 目标是行为对齐官方实现（以官方 demo 为活体对照），不是代码复制。许可证 AGPL-3.0。
> 本文档面向新接手的开发者或 agent：5 分钟跑通构建与验证，然后按需深入 docs/。

## 仓库布局

```
plugin-workflow-approval/   插件本体（src/ 源码，dist/ 构建产物，全部可再生成）
  scripts/build.js          统一构建入口（client-v2/client 双 UMD lane + server + externalVersion）
docs/                       行为契约与对齐记录（01-15 编号 + screenshots 自侧存证）
tools/                      运维与验证工具（部署验证 CI、行为矩阵、探针）
api-captures/               自产行为实测报告（官方原文抓包不入库）
```

## 环境一览

| 环境 | 地址/位置 | 用途 |
|---|---|---|
| 本地主环境 | http://127.0.0.1:13800（~/approvals-reverse/，管理员账号自建，fork 2.4.0-alpha.9） | 日常开发验证的部署目标 |
| v3 测试环境 | http://127.0.0.1:13810（~/approval-v3-dev/，管理员账号自建，npm 3.0.0-alpha.13，内建 pg :40817；AI portal `~/approval-v3-dev/main` 服务于 /x/main/） | `feat/v3-ai-portal` 分支：去 v2 后插件 server 验证 + portal 扩展（`portal/` → `src/extensions/nocobase-workflow-approval/`）开发宿主 |
| 官方 demo | 地址不固化（实例会过期换址），经 `NOCOBASE_DEMO_URL` 注入；对照账号自建 | 活体对照基准 |
| CI 临时环境 | `tools/ci.sh` 每次创建、跑完即删 | 发布物部署验证 |

## 日常命令

```bash
# 构建（client-v2/client 双 UMD + server/locale + externalVersion.js + 完整性校验）
node plugin-workflow-approval/scripts/build.js

# 打发布包（tgz，文件白名单见 package.json files）
cd plugin-workflow-approval && npm pack

# 一键部署验证 CI（新开临时宿主装 tgz → 镜像主环境插件启用状态 + 内置插件全量强制启用 → 依赖兼容检查 → E2E 审批流 → 自动拆除）
tools/ci.sh                 # --keep 保留环境调试；--skip-build 跳过构建
# 测试环境插件面 = 主环境(13800)启用状态镜像，每次运行时活读 DB——在主环境启用/停用插件后无需改 CI；
# 另有内置兼容门：builtIn=true 且未启用的插件在测试环境全部强制启用（含重启后断言），保证兼容实现与完整内置面共存；
# 主环境名不同用 NOCOBASE_CI_MAIN_ENV 覆盖。CI 报告归档 ~/approvals-ci-archive/<ts>/（最近 20 轮全绿+全部失败轮）。

# 部署到本地主环境（开发迭代用）
# 1) 构建：node plugin-workflow-approval/scripts/build.js
# 2) 拷贝 dist/ + client.js + server.js 到 ~/approvals-reverse/storage/plugins/@nocobase/plugin-workflow-approval/ 对应位置
# 3) 重启（必须真正换进程，见下文坑 #1）
cd ~/approvals-reverse && PM2_HOME=$PWD/storage/.pm2 source/node_modules/.bin/pm2 restart index
# 4) 核对进程启动时间晚于部署时间（ps -o lstart -p $(PM2_HOME=~/approvals-reverse/storage/.pm2 ~/approvals-reverse/source/node_modules/.bin/pm2 pid index)）

# 部署到 v3 测试环境（feat/v3-ai-portal 分支；externalVersion 必须按目标宿主生成）
cd plugin-workflow-approval && NOCOBASE_EXTERNAL_HOST=~/approval-v3-dev/source/node_modules node scripts/build.js && npm pack
nb plugin import <tgz> -e approval-v3-dev -y   # 首次后需 SQL INSERT applicationPlugins(installed=false)，boot 自装
nb app restart -e approval-v3-dev              # 同样必须断言进程换新

# portal 扩展开发（源码唯一真源在仓 portal/extension/；生效四步缺一不可——浏览器访问 deploy 拷贝）
./portal/sync.sh && (cd ~/approval-v3-dev/main && pnpm typecheck && pnpm build) && nb portal deploy main -e approval-v3-dev -y

# 官方 demo 换址后重建对照 fixtures（幂等，一跑全绿）
node tools/reseed-demo.mjs --base https://<新demo地址>
```

**成本纪律（语义侦查/对比阶段）**：固定步骤合并成脚本，禁止高阶会话逐条打探针——
```bash
# API 探针批量跑：manifest 列全部请求，登录一次跑完，单 JSON 报告
node tools/probe-batch.mjs --base http://127.0.0.1:13800 --manifest <probes.json> --out <report.json>
# bundle 模块一次抽齐：按模块 id 或内容 grep 出单个 digest 文件（--index 出全量索引）
node tools/module-digest.mjs --in analysis/<x>.beautified.js --id 358 --out /tmp/digest.md
```
材料落盘后整面交给低价子代理/workflow 审读，主会话只终审（详见 skill `nocobase-plugin-reverse` 的成本分层执行策略）。

## 记录与日志归档索引（先登记后落盘）

**规则：任何新产物类别，先在下面这张表登记位置和保留策略，再开始落盘。** `/tmp` 是抛弃区（重启即清、不进索引）——凡以后还要找的东西，当场落进对应层，严禁留宿。

| 层 | 位置 | 收什么 | 保留策略 | 入 git |
|---|---|---|---|---|
| **L1 工程记录** | `docs/NN-*.md` | 编号工程记录（逆向/对照/修复/测试设计），每轮在所属文档**追加**带日期的小节，不另开新散文件 | 永久 | ✅ |
| L1 | `docs/screenshots/<主题>/` | 证据截图：文件名 `<对象ID>-<slug>.png`（ID=T*行为案例/D*审计发现/F*缺陷/K*交互对照）；主题=所属 docs 编号或轮次名。**UI 对比面必须附 `<原名>.annotated.png` 圈选标注版 + 注册表**（规范见 docs/12，首个模板实例） | 永久 | ✅ |
| L1 | `docs/ledger-draft-*.md` | subagent/workflow 产出的账本草案（结论须并回编号 docs，草案留档） | 永久 | ✅ |
| L1 | `plugin-workflow-approval/CHANGELOG.md` | 版本级变更唯一去处（按其头部规范），与 docs 互链不复制 | 永久 | ✅ |
| L1 | `tools/demo-state.json` | 官方 demo fixtures 状态快照（reseed 脚本产出） | 随每轮覆盖 | ✅ |
| **L2 运行归档** | `~/approvals-ci-archive/<yyyymmdd>-<hhmmss>/` | CI 每轮产物：`ci.log`、`report.json`、tgz | 自动轮转：最近 20 轮全绿 + 全部失败轮（`NOCOBASE_CI_ARCHIVE` 可改根） | ❌ |
| **L3 环境日志** | `~/approvals-reverse/storage/.pm2/logs/`；临时环境在各自 `~/ci-*/storage/.pm2/logs/`；nb CLI 在 `~/.nocobase/logs/` | 应用/插件运行日志 | 随环境生灭；要留证先拷进 L1 或 L2 | ❌ |
| **L4 抛弃区** | `/tmp/*` | 登录 token、一次性探针、构建草稿 | 会话结束即视为无效 | ❌ |

**既有截图目录对照**（历史名保持不动以免断链，新截图按上表主题规则落）：`audit-demo`（官方侧审计）、`audit-local`（本地侧审计）、`full-flow`（docs/10 全流程测试）、`demo`/`demo-ui`/`local`/`local-ui`/`storage`（更早期散档，查证时先翻对应 docs 章节引用）。

**找东西的路径**：结论先查 `docs/` 编号文档 → 版本级变更查 `CHANGELOG.md` → 某次 CI 是否绿过查 `~/approvals-ci-archive/`（看 report.json）→ 运行时问题查 L3 日志。任何文档引用的截图/报告路径必须真实存在——提交前 `git status` 检查新证据文件已 `git add`。

## 工程铁律（踩过的坑，先读再动手）

1. **热重启不保证换进程**。`nb app restart` / `pm2 restart` 偶尔不派生新进程，部署后行为“未变”多半是它。部署服务端代码后必须 `ps -o lstart` 核对进程启动时间晚于部署时间，否则 `kill -9 <pid>` 后再 start。CI 里已固化为硬断言（`tools/ci.sh` stage install-plugin）。
2. **本环境进程内 `repo.find` 的 JSON filter 通道失效**（宿主缺陷，lm fork alpha.9）。`repository.find({filter: {$and:[...]}})` 在 workflow 执行进程内静默返回全表；HTTP 层正常。非 HTTP 路径一律 `repo.parseFilter(...) + model.findAll(...)`（见 `src/server/service.js` resolveAssignees）。
3. **`nb plugin enable` 对 storage/plugins 形态的插件不落库**。装好的 tgz 要启用只能直接 SQL INSERT `applicationPlugins`（name=去前缀名、packageName、version、enabled=true、**installed=false**），重启后应用自己跑插件安装（集合同步+迁移）。CI 用同一机制。
4. **开发环境双拷贝遮蔽**。插件同时存在 source 树与 storage/plugins 拷贝时，import 错拷贝会遮蔽真身；import 到 storage/plugins 后若位置不对要删除。
5. **宿主依赖兼容检查读 `dist/externalVersion.js`**（{包根: 版本} 快照）。该文件由 `scripts/build.js` 从源码 import 扫描+本机解析生成；改依赖后重新构建，CI 的 pm-dependency-compat 关卡会拦住缺失/不符。
6. **调试日志必须 `app.logger.warn`**（info 级不落 system log）；排障后删除。
7. **SQL 改 jsonb 列**：`config = config || '...'` 会报错，要 `config = (config::jsonb || '...'::jsonb)::json`。
8. **API 线格式**：`values` 就是扁平 POST body（非包裹）；`filterByTk` 走 query；带 `X-Data-Source: main`；demo 是多空间，还要 `X-Spaces: team_a`。demo 上 member 账号会被空间权限拦（SPACE_NO_PERMISSION），审批动作活体只能用 admin 探到有限深度。
9. **枚举铁律（module 358）**：RECORD_STATUS PENDING=0/RETURNED=1/APPROVED=2/UNPROCESSED=3/DELEGATED=8/ADDED=99/CANCELED=-2；APPROVAL_STATUS DRAFT=0/RETURNED=1/SUBMITTED=2/PROCESSING=3/APPROVED=4/REJECTED=-1。
10. **任何「环境/宿主问题」结论必须先在官方 demo 复现**，不能拿本地环境当判据；文档措辞区分「范围取舍」与「做不到」。
11. **可用性走查门（2026-10-21 用户检讨后固化）**：交付前端改动前必测两条链——①**宿主既有路径**：凡是插件在宿主原生 UI（settings 设计器、任务中心、门户）里有存在感的功能，必须进宿主界面实测可用（v3 settings 壳吃 client-v2 lane 的教训：删 lane 前/后都要进 settings 设计器看一眼，而不是只测 API 端点）；②**用户点击链**：每个按钮按真实用户路径点到终点（数据链路通了≠点击链通，禁用态/遮挡/空态都算不可用）。
12. **v3 lane 判据以壳的实际注入清单为准**：settings 壳注入 client-v2 lane（实测 70+ 插件），判定某 lane 是否被加载要看页面 `script[src]` 实际清单，`pm:listEnabled*` API 端点过滤逻辑不等于壳的注入行为。

## 文档地图

> 本项目方法论已固化为通用 skill：`nocobase-plugin-reverse`（`~/.agents/skills/nocobase-plugin-reverse/SKILL.md`，含七阶段流程与 `references/pitfalls.md` 完整坑表）。逆向其他 NocoBase 付费插件时直接调用该 skill，以本项目为参考实现。

| 文档 | 内容 |
|---|---|
| `docs/01` 逆向总报告 | 插件全景：引擎、数据模型、枚举、动作流 |
| `docs/02` 引擎基线 | workflow 引擎挂载点与触发契约 |
| `docs/03` `docs/04` client-v1 / client-v2 分析 | 两代前端的注册契约、导出名、UI 流（v2 是 current） |
| `docs/05` locale 字符串 | 文案对照 |
| `docs/06` 兼容实现 | 实现结构与取舍 |
| `docs/07` 并排行为对照 | API 线格式逐动作对照 |
| `docs/08` UI 创建 parity | 逐轮修复记录（含工程规范化、干净环境验证、嵌套 filter 三层修复） |
| `docs/09` UI 全量审计 | 四通道证据比对方法与结论 |
| `docs/10` 全流程 parity 测试 | T1-T15 行为矩阵、F 缺陷注册表、demo 换址、依赖对比挖掘 |
| `docs/11` CI/CD 设计 | `tools/ci.sh` 的阶段设计与历史事故映射 |
| `docs/12` 圈选元素注册表 | annotation-first 比对规范与首例（审批节点抽屉 14 元素） |

## 验证与发布

- **行为回归**：`docs/10` 的 T1-T15 矩阵是对齐基线；改行为前先看 F 注册表有没有同类裁决。
- **部署验证**：任何发布物（tgz）必须过 `tools/ci.sh` 全绿——它验证的正是“装到干净宿主能不能用”。
- **版本**：独立版本线 `1.0.0-beta.N`（不随宿主版本走）。发布 = 更新 `CHANGELOG.md`（规范见该文件头部）→ bump package.json → build → `npm pack` → CI 全绿 → git tag。
- **CHANGELOG**：按 Keep a Changelog 七分类（Added/Changed/Fixed/Removed/Breaking/Known deviations/Engineering），每条落行为证据出处（docs 章节或截图路径）。
