/**
 * Shared constants & helpers for the v3 portal approval extension.
 *
 * Ported from the cloned v2 lane (behavioral reference, see docs/13 面 A / 面 H):
 * - H29/H30  : APPROVAL_STATUS / RECORD_STATUS enums, STATUS_TAG / RECORD_TAG maps
 * - A#31     : readUrlFilter / writeUrlFilter / mergeFilters URL filter contract
 * - A#12     : block filter contract constants (FILTER_KEY / PAGE_SIZES / NONFILTERABLE)
 * - H28/H32  : splitCollectionName
 * - A#34     : buildUserFilter (drawer compact filter → workflows filter)
 * - 批5a P3  : stripTTemplate（元数据 title `{{t("key")}}` 模板串剥壳）
 */
import { i18n } from "@nocobase/portal-sdk/i18n";

// ---------------------------------------------------------------- H30 statuses

export const APPROVAL_STATUS = {
  DRAFT: 0,
  RETURNED: 1,
  SUBMITTED: 2,
  PROCESSING: 3,
  APPROVED: 4,
  REJECTED: -1,
  FAILED: -2,
  ABORTED: -3,
} as const;

export const RECORD_STATUS = {
  ASSIGNED: null,
  PENDING: 0,
  RETURNED: 1,
  APPROVED: 2,
  UNPROCESSED: 3,
  PASSED: 4,
  DELEGATED: 8,
  REJECTED: -1,
  CANCELED: -2,
  WITHDRAWN: -3,
  ADDED: 99,
} as const;

// ------------------------------------------------------------------- H29 tags

/** 面B#21 Tag 附带图标（v2 models/shared.js:52-83 META 表 icon 字段，官方 antd 图标名）。 */
export type StatusTagMeta = {
  color: string;
  labelKey: string;
  icon?: string;
};

/** docs/13 H29: STATUS_TAG 8 项（行标签与「审批状态」筛选选项共用）。 */
export const APPROVAL_STATUS_TAG: Record<string, StatusTagMeta> = {
  "0": { color: "gold", labelKey: "approval.status.draft", icon: "EditOutlined" },
  "1": { color: "purple", labelKey: "approval.status.returned", icon: "RollbackOutlined" },
  "2": { color: "cyan", labelKey: "approval.status.submitted", icon: "FileAddOutlined" },
  "3": { color: "geekblue", labelKey: "approval.status.processing", icon: "ClockCircleOutlined" },
  "4": { color: "green", labelKey: "approval.status.approved", icon: "CheckOutlined" },
  "-1": { color: "red", labelKey: "approval.status.rejected", icon: "CloseOutlined" },
  "-2": { color: "red", labelKey: "approval.status.failed", icon: "ExclamationCircleOutlined" },
  "-3": { color: "default", labelKey: "approval.status.aborted", icon: "StopOutlined" },
};

/** docs/13 H29: RECORD_TAG 11 项（含 null=待分配；「处理状态」筛选剔除 null）。 */
export const RECORD_STATUS_TAG: Record<string, StatusTagMeta> = {
  "0": { color: "gold", labelKey: "approval.recordStatus.pending", icon: "ClockCircleOutlined" },
  "1": { color: "purple", labelKey: "approval.recordStatus.returned", icon: "RollbackOutlined" },
  "2": { color: "green", labelKey: "approval.recordStatus.approved", icon: "CheckOutlined" },
  "3": { color: "default", labelKey: "approval.recordStatus.unprocessed" },
  "4": { color: "green", labelKey: "approval.recordStatus.passed" },
  "8": { color: "geekblue", labelKey: "approval.recordStatus.delegated", icon: "ExportOutlined" },
  "-1": { color: "red", labelKey: "approval.recordStatus.rejected", icon: "CloseOutlined" },
  "-2": { color: "default", labelKey: "approval.recordStatus.canceled", icon: "StopOutlined" },
  "-3": { color: "default", labelKey: "approval.recordStatus.withdrawn", icon: "UndoOutlined" },
  "99": { color: "blue", labelKey: "approval.recordStatus.added", icon: "PlusOutlined" },
  null: { color: "default", labelKey: "approval.recordStatus.assigned", icon: "HourglassOutlined" },
};

export type StatusTagMap = Record<string, StatusTagMeta>;

/** antd tag color → shadcn/tailwind badge classes（克隆自实现的皮肤映射）。 */
const TAG_COLOR_CLASS: Record<string, string> = {
  gold: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  geekblue: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  magenta: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-400",
  volcano: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

export const tagColorClass = (color?: string) =>
  (color && TAG_COLOR_CLASS[color]) || undefined;

// --------------------------------------------------- A#12 block filter contract

export const BLOCK_FILTER_KEY = "workflowApprovalBlockFilter";
export const PAGE_SIZES = [5, 10, 20, 50, 100];
export const APPLY_NONFILTERABLE = [
  "workflow.type",
  "workflow.sync",
  "workflow.description",
  "workflow.categories",
  "workflow.enabled",
  "createdBy",
];
export const TODO_NONFILTERABLE = [
  "workflow.type",
  "workflow.sync",
  "workflow.description",
  "workflow.categories",
  "workflow.enabled",
  "user",
  "approval.workflow",
  "approval.createdBy.password",
  "approval.createdBy.email",
  "approval.createdBy.phone",
  "approval.createdBy.username",
  "approval.createdBy.createdAt",
  "approval.createdBy.updatedAt",
];

// -------------------------------------------------------- A#31 URL filter contract

export const APPLY_FILTER_KEY = "workflowApprovalApplicationsFilter";
export const TODOS_FILTER_KEY = "workflowApprovalTodosFilter";

export type UrlFilter = Record<string, unknown>;

/** JSON 守卫：解析失败 / 非对象 / 数组 → undefined（applyNew.jsx:79-90）。 */
export function readUrlFilter(key: string): UrlFilter | undefined {
  try {
    const raw = new URLSearchParams(window.location.search).get(key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as UrlFilter)
      : undefined;
  } catch {
    return undefined;
  }
}

/** 官方 eu()：仅 AND 合并非空 filter（applyNew.jsx:93-99）。 */
export function mergeFilters(
  ...filters: Array<UrlFilter | null | undefined>
): UrlFilter {
  const parts = filters.filter(
    (f) => f && typeof f === "object" && Object.keys(f).length > 0
  ) as UrlFilter[];
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/** 空删有写 + history.replaceState（applyNew.jsx:101-108）。 */
export function writeUrlFilter(key: string, filter?: UrlFilter): void {
  const url = new URL(window.location.href);
  const empty =
    !filter || typeof filter !== "object" || Object.keys(filter).length === 0;
  if (empty) url.searchParams.delete(key);
  else url.searchParams.set(key, JSON.stringify(filter));
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

// --------------------------------------------------------------- H28 splitCollection

/** 'ds:collection' → [ds, name]；无冒号回落 ['main', value]（index.jsx:95，shared.js:127）。 */
export function splitCollectionName(value?: string | null): [string, string] {
  if (!value) return ["main", ""];
  if (value.includes(":")) {
    const [ds, name] = value.split(":");
    if (ds && name) return [ds, name];
  }
  return ["main", value];
}

// ------------------------------------------------- 批5a P3 title 模板剥壳

/**
 * collections:list / collections:get(fields) 返回的 title 可能是未编译的 i18n
 * 模板串 `{{t("Users")}}`（批4 冒烟 P3 实证：数据表下拉直出原始串）。
 *
 * 行为：整串匹配 `{{t("key")}}`（双/单引号）→ 取 key；key 能命中宿主 i18n
 * 词条则翻译，否则显示剥壳 key；非模板串原样返回（trim）。i18n 未初始化/异常
 * 时回落剥壳 key，不抛错。
 */
export function stripTTemplate(raw?: string | null): string {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) return "";
  const matched = /^\{\{\s*t\(\s*(?:"([^"]+)"|'([^']+)')\s*\)\s*\}\}$/.exec(title);
  if (!matched) return title;
  const key = (matched[1] ?? matched[2] ?? "").trim();
  if (!key) return "";
  try {
    if (i18n.isInitialized && i18n.exists(key)) return i18n.t(key);
  } catch {
    // i18n 未就绪：回落剥壳 key
  }
  return key;
}

// ------------------------------------------------- A#34 drawer compact filter

export interface ApplyFlowFilterState {
  title?: string;
  id?: string;
}

/** 单条直用 / 多条 $and（applyNew.jsx:199-206）。 */
export function buildUserFilter(
  state: ApplyFlowFilterState
): Record<string, unknown> | undefined {
  const conds: Record<string, unknown>[] = [];
  if (state.title) conds.push({ title: { $includes: state.title } });
  if (state.id) conds.push({ id: Number(state.id) || state.id });
  if (!conds.length) return undefined;
  return conds.length === 1 ? conds[0] : { $and: conds };
}

// ------------------------------------------------- 批8 审批写后失效（异步追平）

/**
 * 审批写操作（发起/通过/退回/转签/加签）后的查询失效：立即一拍 + 1.2s/3.2s 两拍
 * 延迟补拍。工作流执行是异步的——提交瞬间审批记录还没落库，只失效一次会让角标/
 * 列表停在旧值，等下次交互才对上；延迟拍追平异步落库。
 */
export function invalidateApprovalQueriesAfterWrite(
  queryClient: import("@tanstack/react-query").QueryClient
): void {
  const fire = () =>
    void queryClient.invalidateQueries({
      queryKey: ["workflow-approval"],
    });
  fire();
  window.setTimeout(fire, 1_200);
  window.setTimeout(fire, 3_200);
}
