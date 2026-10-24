# @nocobase/plugin-workflow-approval（逆向兼容实现）

NocoBase 付费「工作流：审批」插件的行为级兼容实现（clean-room reimplementation）：从官方 demo 的黑盒行为观测 + 前端 bundle 静态分析重建，不包含任何官方专有代码。

## 免责声明

- 本项目为独立研究性质的行为复刻，与 NocoBase 官方无关联，未获官方背书。
- 官方 `@nocobase/plugin-workflow-approval` 是 NocoBase 的商业插件；生产环境请购买官方授权。
- 本仓库代码以 AGPL-3.0 发布（官方工作流内核 `@nocobase/plugin-workflow` 为 Apache-2.0，见其包声明）。
- 包名与官方包同名是**有意为之**：兼容实现部署机制依赖同名遮蔽（node_modules 覆盖 + 客户端 lane 的 RequireJS 模块名）。请勿与官方包混装。

## 运行要求

| 依赖 | 版本 |
| --- | --- |
| NocoBase 宿主 | 2.4.x（开发对齐 2.4.0-alpha.9，行为参照官方 demo 2.4.0-alpha.10） |
| @nocobase/plugin-workflow | >= 0.17.0-alpha.3 |
| @nocobase/plugin-notification-manager | 站内信通知渲染（可选，无则通知降级为仅写库） |

## 安装

```bash
nb plugin import /path/to/@nocobase/plugin-workflow-approval-<version>.tgz
nb app restart
# 之后在插件管理器（/v/admin/pm）中启用
```

## 功能（beta1）

**服务端**
- `approval` 触发器 + `approval` 指令：多人审批（会签/或签/依次）、退回、加签/转办、多轮审批
- collections：approvals / approvalRecords / approvalAudiences / approvalAudienceUsers / approvalExecutions / approvalMsgTpls
- actions：发起（`approvals:create`，草稿态与直接提交态）、撤回、退回、转办、加签（`approvalRecords:submit|return|delegate|add` + `reassignees:list`）、`workflows:listApprovalFlows`（任务中心「发起新申请」数据源）
- 通知：节点级 todo 组（审批进入 PENDING 时按人发送）、触发器级 done 组（终结时发申请人）；模板经 notification-manager 以 Handlebars 渲染；安装时种子内置渠道与两份默认模板

**客户端 v1 lane**（workflow-v1 流程画布）
- 审批节点配置界面：处理人、审批模式、逐级审批、通知配置等 fieldset

**客户端 v2 lane**（modern-loader / 任务中心）
- 任务中心 taskType：我的申请 / 待办（tab、角标统计、刷新、筛选、发起新申请抽屉）
- 审批详情基类与详情卡、审批页模型、审批时间线、通知字段集、表单模式模型
- `registerModelLoaders` 懒加载 + `registerCollections`

## 已知差异

与官方的行为差异、范围取舍（紧凑皮肤、沙箱化 JSItemModel、audienceType 服务端缺口、Print 按钮等）逐项记录在上层研究仓库的 `docs/08-ui-creation-parity.md` 与 `docs/09-ui-full-audit.md`。

## 开发

```bash
npm run build       # 全量构建：client + client-v2（UMD）+ server/locale（原样拷贝）
npm run clean       # 删除 dist/
./dev-restart.sh    # 构建 + 部署到本地 nb 环境（~/approvals-reverse）并重启验证
```

源码结构：`src/server`（纯 CJS，无转译）、`src/client`（v1）、`src/client-v2`（模型层）、`src/locale`；`dist/` 全部为构建产物，不要手改。
