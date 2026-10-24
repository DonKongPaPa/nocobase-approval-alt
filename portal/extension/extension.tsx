import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { workflowApprovalRoutes } from "./app-routes";
import { InboxBell } from "./components/inbox-bell";
import { StorySwitcher } from "./components/story-switcher";
import "./locales";

/**
 * v3 AI portal 审批扩展（docs/13 面 A 批1：审批中心双列表 + 发起新申请基建）。
 * 注册形态与 users-example 一致：AppExtension{id, priority, routes}，
 * 由 portal app `src/app/extensions.tsx` 的 import.meta.glob 自动加载。
 */
const workflowApprovalExtension: AppExtension = {
  id: "nocobase-workflow-approval",
  priority: 0,
  routes: workflowApprovalRoutes,
  // Provider 包裹全部已认证路由（宿主 routes.tsx AppExtensionProviders）：
  // InboxBell 右上角收信箱（header 注入）+ StorySwitcher（默认不可见，?story=1 点亮）
  Provider: ({ children }) => (
    <>
      {children}
      <InboxBell />
      <StorySwitcher />
    </>
  ),
};

export default workflowApprovalExtension;
