# portal/ — v3 AI portal 审批扩展（示范 + 验证实现）

> 分支 `feat/v3-ai-portal`：插件去掉 v2 UI lane 后，审批前端能力在本目录以 **v3 AI portal 扩展**形态全量复现。
> 定位：reference implementation——示范一个 NocoBase 付费插件的前端如何在 v3 portal 栈（refine + shadcn + @nocobase/portal-sdk）上重建，同时逐项验证 docs/13 标记的功能点（验收矩阵见 `docs/14`）。

## 目录

```
portal/
  README.md      本文件
  sync.sh        rsync 同步扩展源码到 v3 测试环境 portal app
  extension/     扩展源码（nocobase-workflow-approval）
```

## 开发环境

| 资产 | 值 |
| --- | --- |
| v3 宿主 | `approval-v3-dev` @ http://127.0.0.1:13810（3.0.0-alpha.13，basic 管理员账号自建） |
| portal app | `~/approval-v3-dev/main`（@nocobase/portal-template-default，服务路径 `/x/main/`） |
| 扩展落点 | `~/approval-v3-dev/main/src/extensions/nocobase-workflow-approval/` |
| 扩展注册 | portal app `src/app/extensions.tsx` 以 `import.meta.glob("@/extensions/*/extension.tsx")` 自动加载，放入即注册 |
| 解剖参照 | 同 app `src/extensions/nocobase-users-example/`（AppExtension + defineAppRoutes + resource meta + lazy 路由 + locales） |

## 日常命令

```bash
# 同步扩展到 portal app（源码唯一真源在本仓，portal app 内不改）
./portal/sync.sh

# portal 侧构建/类型检查（在 portal app 内）
cd ~/approval-v3-dev/main && pnpm build
cd ~/approval-v3-dev/main && pnpm exec portal-sdk check   # sdk 契约检查
cd ~/approval-v3-dev/main && pnpm dev                     # 开发模式（含热更）
```

> **⚠ 生效铁律（2026-10-21 实测教训）**：浏览器访问的是 **deploy 部署拷贝**（`~/approval-v3-dev/storage/portals/main/main`），不是 dev 目录的 dist。改动生效四步缺一不可：
> 1. `./portal/sync.sh` → 2. `pnpm -C ~/approval-v3-dev/main typecheck` → 3. `pnpm -C ~/approval-v3-dev/main build` → 4. **`nb portal deploy main -e approval-v3-dev -y`**
> 漏第 4 步会看到旧页面（批4 曾因此误判路由 404）。

## 施工规格

每一面的功能点、锚点、API 契约、官方证据见 `docs/13-frontend-feature-inventory.md`（317 项）。
判定列 portal-rebuild 的每项都要在 `docs/14-v3-portal-parity.md` 有对应验收行。
