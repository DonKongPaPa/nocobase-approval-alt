import { ClipboardList, Inbox } from "lucide-react";

import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { TodosBadge } from "./components/todos-badge";
import { approvalRoutes } from "./routes";

/**
 * 面 A 审批中心双列表（v3 portal 形态）：
 * v1/v2 宿主的「任务中心 approval-apply / approval-todos 两个 task type」在
 * v3 AI portal 中表现为两个顶层资源页 —— /approvals（我的申请）与 /approvals/todos（我的审批）。
 * 批5b 曾有 /approvals/notifications（通知模板管理）；批7 按用户裁决整页裁撤
 * （AI portal 按渠道自由呈现通知，前端不做模板管理，服务端发送链保留）。
 * 批6 收缩：/approvals/workflows（工作流管理+配置页）与 /approvals/designers（界面设计器）
 * 整体撤除——workflow 配置归宿主 settings 的 workflow 设计器（另一条 lane 适配），
 * 界面配置由 AI portal 的 AI 能力承担，不在审批前端手写设计器。
 *
 * 批8：meta.badge（ReactNode）由壳侧边栏渲染为官方 SidebarMenuBadge（壳的
 * app-shell/sidebar.tsx 批8 接线）；TodosBadge 实时取未处理待办数。
 */
export const workflowApprovalRoutes = defineAppRoutes([
  {
    name: "approvals",
    path: approvalRoutes.applications,
    lazy: () => import("./applications"),
    resource: {
      meta: {
        label: "My applications",
        priority: 30,
        singularLabel: "My applications",
        i18nKey: "resources.approvals",
        i18nSingularKey: "resources.approvals.singular",
        i18nOptions: { ns: "app" },
        descriptionI18nKey: "resources.approvals.description",
        icon: <ClipboardList />,
        description:
          "Track the approvals you initiated, from draft to final state.",
      },
    },
    // 批16：详情路由化（用户模块 users/show 同款 RouteDrawer surface——
    // 移动全屏+手势关闭、桌面侧抽屉；列表保持挂载，筛选/滚动状态不丢）
    children: [
      {
        name: "approvals.detail",
        path: "detail/:id",
        resourceAction: "show",
        lazy: () =>
          import("./detail-route").then((module) => ({
            default: module.ApprovalApplicationDetailRoute,
          })),
      },
    ],
  },
  {
    name: "approvalTodos",
    path: approvalRoutes.todos,
    lazy: () => import("./todos"),
    resource: {
      meta: {
        label: "My approvals",
        priority: 31,
        singularLabel: "My approvals",
        i18nKey: "resources.approvalTodos",
        i18nSingularKey: "resources.approvalTodos.singular",
        i18nOptions: { ns: "app" },
        descriptionI18nKey: "resources.approvalTodos.description",
        icon: <Inbox />,
        description: "Process approval tasks assigned to you.",
        badge: <TodosBadge />,
      },
    },
    children: [
      {
        name: "approvalTodos.detail",
        path: "detail/:id",
        resourceAction: "show",
        lazy: () =>
          import("./detail-route").then((module) => ({
            default: module.ApprovalRecordDetailRoute,
          })),
      },
    ],
  },
]);
