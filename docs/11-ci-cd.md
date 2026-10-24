# 11 — 部署验证 CI/CD 设计（tools/ci.sh）

> 目标：把「beta1 发布物在干净宿主上装得起来、跑得起来」从一次性人工验证（docs/08 §10.2）固化为一条命令、可重复、跑完即清的管线。接手上手与日常命令见仓库根 `CONTRIBUTING.md`。

## 一、管线结构（五阶段）

```
build → pack → provision → install-plugin → smoke → teardown
```

| 阶段 | 动作 | 拦截的历史事故 |
| --- | --- | --- |
| build | `scripts/build.js`（双 UMD lane + server + externalVersion）；断言 `dist/externalVersion.js` 存在 | externalVersion 缺失导致 pm 依赖兼容检查空表（docs/08 §10.1） |
| pack | `npm pack`；校验 tgz 内容：无白名单外文件 + 关键文件在（server/externalVersion/双 lane/locale） | 包形态不标准导致宿主装完不可用 |
| provision | 硬链接拷贝钉版 fork 源 → `nb init -s npm --skip-download --builtin-db`（独立 postgres 容器）→ 健康等待 | 宿主漂移（`nb init` 默认装最新版，clean 环境曾意外装到 alpha.10） |
| install-plugin | `nb plugin import` tgz → SQL INSERT `applicationPlugins`(installed=false) → **镜像主环境插件启用状态**（每次运行时活读主环境 DB，含禁用方向；主环境有而新环境没有的插件记 note 跳过）→ **内置插件全量强制启用**（`builtIn=true` 且未启用的全部置 enabled，见决策六）→ 重启 → **进程启动时间断言** → 重启后**内置无禁用断言** | `nb plugin enable` 不落库（docs/08 §10.2）；热重启不换进程（docs/08 §10.3）；测试环境插件面与主环境漂移；内置插件与兼容实现共存兼容 |
| smoke | `tools/ci-smoke.mjs` 九关（下表） | 端到端行为不可用但进程活着 |
| teardown | 停容器 → `podman unshare rm -rf`（容器属主 pgdata）→ `nb env remove` | pgdata 属主是容器映射 uid，普通 rm 报 EACCES |

`--keep` 保留环境与 `~/approvals-ci-archive/<ts>/` 报告调试；失败时无论是否 `--keep` 都保留现场并打印清理命令。产物归档与轮转规则见 CONTRIBUTING.md「记录与日志归档索引」（保留最近 20 轮全绿 + 全部失败轮）。

## 二、smoke 九关（tools/ci-smoke.mjs）

1. `auth:signIn`（local 认证器）
2. **pm 依赖兼容关卡**：`pm:get` → `isCompatible===true` 且 `depsCompatible` 20 行全过——正是 externalVersion 回归的直接防线
3. 静态资产双 lane：`/dist/<v>/static/plugins/@nocobase/plugin-workflow-approval/dist/{client-v2,client}/index.js` 200
4. fixture：API 建集合+探测物理列可写（不可写则 `ALTER TABLE` 自愈——宿主元数据/物理列同步时差的已知怪癖，docs/08 §10.2）+ 两个审批人用户
5. 会签工作流（negotiation=1、双审批人）建流+启用+节点
6. 发起申请 → 断言两笔 `approvalRecords` PENDING 且 userId 与配置一致（覆盖服务端 resolveAssignees 全链路，含条件分组 filter 解析的宿主通道，见坑 #2）
7. **由被指派人本人**逐个 `approvalRecords:submit`（status=2）→ 断言 approval 终态 4 APPROVED。root 代批会被 403「You are not assigned to this approval」拦下——权限模型本身即断言点
8. pm2 error log 尾部扫描：不得出现 workflow-approval 相关 error
9. 报告 JSON 落盘（`~/approvals-ci-archive/<ts>/report.json`），任一关失败即整体 FAIL

## 三、关键机制决策（实测依据）

- **宿主模板=钉版 fork 源硬链接拷贝**（`cp -al`，秒级、零磁盘）。部署验证的对象是「fork 2.4.0-alpha.9 这个实际部署目标」，不能用 `nb init` 默认最新版。首次实测即证：省略 `-s npm` 时 init 落入 **docker 模式**（起 `nocobase:alpha-full` 镜像容器），与钉版目标完全脱钩——`-s npm` 必须显式。
- **init 认证必须非交互**：fork CLI init 收尾会走 OAuth 设备码登录（`/settings/idpOAuth/device?user_code=…`）等人批准，无人值守必挂；传 `-a basic --username --password` 走 basic。
- **插件启用走 SQL INSERT（installed=false）**：boot 时应用自己跑插件安装（集合同步+迁移），这是 storage/plugins 形态唯一可靠的启用路径（docs/08 §10.2 实录）。
- **进程时间断言硬编码进 CI**：`nb app restart` 不保证派生新进程；记录重启时刻，断言 PM2 进程 `etimes` 小于该时刻，否则 kill -9 再 start（docs/08 §10.3 的教训固化为机器断言）。
- **teardown 顺序**：容器先删 → `podman unshare rm -rf` 目录 → `nb env remove -f` 清注册表。`nb env remove --purge` 实测会对容器属主 pgdata EACCES 半途而废，不能作为唯一清理手段。
- **插件启用状态镜像主环境**（用户要求固化）：测试环境每次运行时从主环境 DB（`nb-<主环境名>-postgres` 容器，`NOCOBASE_CI_MAIN_ENV` 可改名）活读 `applicationPlugins` 的 enabled 布尔并整表对齐（双向：主环境启用的启用、禁用的禁用）；`workflow-approval` 除外（由本管线 tgz 安装）；主环境有而新环境没有的插件（后续加装、文件不在钉版源里）跳过并打印 note。放在 workflow-approval INSERT 之后、重启之前，与插件安装共享同一次重启。镜像后断言 workflow 引擎仍启用，否则立即失败（smoke 前置条件）。
- **内置插件兼容门（用户要求固化，2026-10-23）**：镜像之后把 `builtIn=true` 且未启用的插件**全部强制置 enabled=true**——兼容实现必须在完整内置插件面旁边干净装载，不能只在自己惯用的子集里活着；主环境自己禁用了哪些内置件不影响这层保证。未安装过的内置行保持 installed=false，boot 时与应用装 workflow-approval 一样走自装（集合同步+迁移）。重启后再次查询断言**无任何内置插件处于禁用态**：某个内置件装不上/启动报错/被翻回禁用，都在 smoke 之前直接判红。

## 四、范围边界

- CI 验证**部署与最小行为链**（装得上、依赖兼容、资源服务、会签终态），不覆盖 docs/10 的 T1-T15 全行为矩阵与 UI 拟真操作——那些是发布前的人工/半自动轮，两者互补。
- 官方 demo 对照不在 CI 内（demo 会过期换址，对照 fixtures 用 `tools/reseed-demo.mjs` 幂等重建）。
- 运行环境假设：rootless podman 可用（内建 db 容器）、`~/approvals-reverse/source` 为钉版 fork 模板（可用 `--fork` 覆盖）、nb CLI 注册表在 `~/.nocobase`。

## 五、实测记录（2026-10-15 首跑）

- 全管线绿：build 4 lane → tgz 25 文件白名单过 → provision（13000 端口，pg 容器 44751）→ import+INSERT+重启（fresh pid 断言过）→ smoke 九关全绿 → teardown 无残留。
- 调试轮修掉三处脚本自身问题：pack 白名单目录条目前缀匹配、smoke 脚本 CJS/ESM 混用、审批提交改指派人本人（root 代批 403 属正确行为，已改为断言路径）。
- 2026-10-23 仿真矩阵轮后复跑（`--skip-build` 复用同源 dist）：九关全绿；tgz sha256 `ad4b66c0…ad039`。同轮加入内置插件兼容门（决策六），下一轮起生效。
