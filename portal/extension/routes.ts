export const approvalRoutes = {
  applications: "/approvals",
  todos: "/approvals/todos",
  /** 批7 裁撤：通知模板管理页整页移除（用户裁决：模板已无意义，AI portal 按渠道自由呈现；
   * 审批插件只负责把通知发出去，发送链留在服务端 server/notifications.js，前端不再承接）。 */
} as const;

// 批16：详情路由化（RouteDrawer，列表 children 路由）
export const getApplicationDetailPath = (id: string | number) =>
  `/approvals/detail/${encodeURIComponent(id)}`;

export const getTodoDetailPath = (id: string | number) =>
  `/approvals/todos/detail/${encodeURIComponent(id)}`;
