import { useTranslate } from "@refinedev/core";
import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  FilePlus,
  Hourglass,
  Pen,
  Plus,
  Undo2,
  X,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import dayjs from "dayjs";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "./reui/timeline";
import { tagColorClass } from "../shared";

/**
 * 审批过程时间线 — docs/13 面 C（C-05~C-29）对 v2 `models/approvalTimeline.jsx`
 * （官方私有 bundle module 7781 xY/xG / 2062 `O` / 9488 / 7886）的 portal 重建：
 * 皮肤为 reui.io Timeline（registry base-nova，./reui/timeline 移植），数据层
 * （节点聚合、dot 状态映射、comment 对象感知、当前节点 actionEnabled 语义）
 * 逐条对齐 v2 行为；状态色以 tagColorClass 覆盖 TimelineIndicator。
 *
 * 时间线组件不自行拉数（面 C 施工提示）：数据由详情弹窗 approvals:get /
 * approvalRecords:get 注入，appends 覆盖 rounds / records(+job/node/user) /
 * latestRound(+execution.jobs) / workflow.nodes。
 */

// ------------------------------------------------------------------ types

export interface TimelineUser {
  id?: number | string | null;
  nickname?: string | null;
  username?: string | null;
  name?: string | null;
}

export interface TimelineNode {
  id?: number | string | null;
  title?: string | null;
  config?: { negotiation?: number | string | null } | null;
}

export interface TimelineRecord {
  id?: number | string | null;
  jobId?: number | string | null;
  job?: TimelineJob | null;
  approvalExecutionId?: number | string | null;
  userId?: number | string | null;
  user?: TimelineUser | null;
  nodeId?: number | string | null;
  node?: TimelineNode | null;
  index?: number | null;
  status?: number | null;
  comment?: unknown;
  updatedAt?: string | null;
  createdAt?: string | null;
  /** record.type 官方字符串名（module 358 `nS`：Normal / Delegated / Added）。 */
  type?: string | null;
  prevRecordId?: number | string | null;
  /** C-10 decorateRecordItem 挂接的 ADDED 兄弟 / DELEGATED 后继。 */
  added?: TimelineRecord[];
  delegatedTo?: TimelineRecord;
}

export interface TimelineJob {
  id?: number | string | null;
  status?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  node?: TimelineNode | null;
  records?: TimelineRecord[] | null;
}

export interface TimelineRound {
  id?: number | string | null;
  status?: number | null;
  reason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  jobs?: TimelineJob[] | null;
  execution?: TimelineRound | null;
  node?: TimelineNode | null;
  user?: TimelineUser | null;
  jobId?: number | string | null;
}

/** v2 actionCard 的 action 形态（:491-497 / :596-600）：五操作轮次接线点。 */
export interface TimelineAction {
  kind: "application" | "approvalRecord";
  record: Record<string, unknown>;
}

export interface ApprovalTimelineProps {
  /** approval 详情（approvals:get）或记录详情（approvalRecords:get，取嵌套 approval）。 */
  source: unknown;
  currentUserId?: string | number | null;
  /**
   * C-22/C-23/C-24 当前节点语义：true 时 Apply 卡（本人发起）与 job 卡
   *（本人有未撤回记录）标记为 actionable 并经 renderActionCard 渲染高亮。
   * v2 任务中心详情弹窗 TaskApprovalTimeline({taskRecord}) 未传 → 默认 false
   *（普通卡片）；五操作轮次接入时由弹窗开启。
   */
  actionEnabled?: boolean;
  /** renderActionCard 等价（C-22）：提供时 actionable 卡渲染为可点击高亮卡。 */
  renderActionCard?: (info: {
    action: TimelineAction;
    cardKey: string;
    cardProps: { title?: string; extra?: ReactNode };
    children: ReactNode;
  }) => ReactNode;
  /**
   * C-22 契约保留位：reui 皮肤下卡片描边已随 TimelineCard 退场，本 prop
   * 不再影响渲染（v2 :551 borderless 语义成为唯一形态）。
   */
  border?: boolean;
}

// ----------------------------------------------- C-05 dayjs relativeTime 内联补丁
// 批15：中文化（dayjs 默认 locale 是 en，localeData 回退产出 "a minute"/"4 seconds"）

const RELATIVE_DEFAULTS: Record<string, string> = {
  future: "%s后",
  past: "%s前",
  s: "几秒",
  ss: "%d 秒",
  m: "1 分钟",
  mm: "%d 分钟",
  h: "1 小时",
  hh: "%d 小时",
  d: "1 天",
  dd: "%d 天",
  M: "1 个月",
  MM: "%d 个月",
  y: "1 年",
  yy: "%d 年",
};

const RELATIVE_UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
  month: 2678400000,
  year: 31536000000,
};

const RELATIVE_THRESHOLDS: Array<[string, number, string]> = [
  ["ss", 44, "second"],
  ["s", 45, "second"],
  ["m", 45, "minute"],
  ["mm", 8, "minute"],
  ["h", 22, "hour"],
  ["hh", 22, "hour"],
  ["d", 26, "day"],
  ["dd", 25, "day"],
  ["M", 11, "month"],
  ["MM", 11, "month"],
  ["y", 17, "year"],
  ["yy", 543, "year"],
];

/** dayjs.from(from, withoutSuffix)（approvalTimeline.jsx:70-90 克隆自实现）。 */
function relativeFrom(toAt: dayjs.Dayjs, fromAt: dayjs.Dayjs, withoutSuffix: boolean): string {
  // dayjs 类型面未引入 localeData 插件声明，与 v2 内联补丁一致按鸭子类型取
  const localeData = (
    toAt as unknown as { localeData?: () => Record<string, unknown> }
  ).localeData?.();
  const rel = {
    ...RELATIVE_DEFAULTS,
    ...((localeData?.relativeTime as Record<string, string> | undefined) ?? {}),
  };
  const isFuture = toAt.valueOf() >= fromAt.valueOf();
  const absSec = Math.abs(toAt.diff(fromAt)) / 1000;
  let chosen: [string, string] = ["yy", "year"];
  for (const [key, boundary, unit] of RELATIVE_THRESHOLDS) {
    if (absSec <= boundary * (RELATIVE_UNIT_MS[unit] / 1000)) {
      chosen = [key, unit];
      break;
    }
  }
  const [key, unit] = chosen;
  let number = Math.abs(Math.round(toAt.diff(fromAt, unit as dayjs.OpUnitType, true)));
  if (key === "s" || key === "ss") number = Math.max(1, Math.round(absSec));
  const raw = rel[key] ?? "%d";
  let text = String(raw).replace("%d", String(number));
  if (withoutSuffix) return text;
  const template = isFuture ? (rel.future ?? "%s") : (rel.past ?? "%s");
  return String(template).replace("%s", text);
}

// ------------------------------------------------- C-06 formatDateTime（module 7886）

function formatDateTime(value: unknown): string {
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ------------------------------------------------------------- 7781 helpers

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const get = <T,>(obj: unknown, key: string): T | undefined =>
  isObj(obj) ? (obj[key] as T | undefined) : undefined;
const numeric = (v: unknown): number | undefined =>
  typeof v === "number" || typeof v === "string" ? Number(v) : undefined;
const objArray = (v: unknown): Record<string, unknown>[] => {
  if (Array.isArray(v)) return v.filter(isObj);
  if (isObj(v)) return Object.values(v).filter(isObj);
  return [];
};
const pathGet = (obj: unknown, path: string): unknown =>
  path.split(".").reduce((acc: unknown, key) => get(acc, key), obj);
const strVal = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
const toNum = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const strOrNull = (v: unknown): string | undefined =>
  v == null ? undefined : String(v);
const sameStr = (a: unknown, b: unknown): boolean => {
  const x = strOrNull(a);
  return x !== undefined && x === strOrNull(b);
};

/** C-09 comment 对象感知渲染（approvalTimeline.jsx:132-141）：jsonb {text} 兼容。 */
export function commentText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const text = record.text ?? record.content ?? record.message;
    if (text != null) return String(text).trim();
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

const pickApproval = (source: unknown): Record<string, unknown> =>
  isObj(source) && isObj(source.approval) ? source.approval : isObj(source) ? source : {};

function findNode(
  nodes: Record<string, unknown>[],
  record: Record<string, unknown> | undefined,
  job: Record<string, unknown> | undefined
): TimelineNode {
  const nodeId =
    record?.nodeId ?? pathGet(record, "nodeId") ?? pathGet(record, "node.id");
  const byId = nodes.find((node) => sameStr(node?.id, nodeId));
  if (byId) return byId as TimelineNode;
  const recordNode = get<TimelineNode>(record, "node");
  if (isObj(recordNode)) return recordNode;
  const jobNode = get<TimelineNode>(job, "node");
  if (isObj(jobNode)) return jobNode;
  return { id: nodeId as number | string | null | undefined, title: "-", config: {} };
}

function jobsOf(round: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const jobs = objArray(round?.jobs);
  return jobs.length ? jobs : objArray(pathGet(round, "execution.jobs"));
}

// C-10 record.type 官方字符串名（module 358 `nS`）
const RECORD_TYPE_NAME = { NORMAL: "Normal", DELEGATED: "Delegated", ADDED: "Added" } as const;

/** C-10 decorateRecordItem（approvalTimeline.jsx:176-187）：挂接 ADDED 兄弟 + DELEGATED 后继。 */
function decorateRecordItem(
  record: Record<string, unknown>,
  records: Record<string, unknown>[]
): TimelineRecord {
  return {
    ...(record as TimelineRecord),
    added: records.filter(
      (item) =>
        item?.type === RECORD_TYPE_NAME.ADDED && sameStr(item?.prevRecordId, record?.id)
    ) as TimelineRecord[],
    delegatedTo: records.find(
      (item) =>
        item?.type === RECORD_TYPE_NAME.DELEGATED && sameStr(item?.prevRecordId, record?.id)
    ) as TimelineRecord | undefined,
    user: (record?.user ?? undefined) as TimelineUser | undefined,
  };
}

/** C-11 stableKey（approvalTimeline.jsx:190-195）：31 位滚动哈希 base36。 */
function stableKey(parts: unknown[]): string {
  const text = JSON.stringify(parts.map((part) => (part != null ? part : null)));
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (31 * hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

// --------------------------------------------------- C-12 用户 Chip（头像+姓名）

function userLabel(user: TimelineUser | null | undefined, fallback: string): string {
  const name =
    user?.nickname ||
    user?.username ||
    user?.name ||
    (user?.id == null ? fallback : String(user.id));
  return name ?? fallback;
}

function initialOf(name: string): string {
  return Array.from(String(name ?? "").trim())[0]?.toUpperCase() || "?";
}

function avatarColor(seed: unknown): string {
  let hash = 0x811c9dc5;
  const text = String(seed);
  for (const ch of text) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x1000193);
  }
  const hue = Math.round((((hash >>> 0) & 255) * 137.508) % 360);
  return `hsl(${hue}, 58%, 42%)`;
}

export function UserChip({
  data,
  fallback = "-",
}: {
  data: TimelineUser | null | undefined;
  fallback?: string;
}) {
  const name = userLabel(data, fallback);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar className="size-5 text-[10px]">
        <AvatarFallback
          className="text-[10px] font-medium text-white"
          style={{ backgroundColor: avatarColor(data?.id ?? name) }}
          aria-label={name}
        >
          {initialOf(name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

function renderUser(user: TimelineUser | null | undefined, fallback: string): ReactNode {
  return <UserChip data={user} fallback={fallback} />;
}

// ------------------------------------------------- C-14~C-17 dot 图标/颜色映射

/** C-14 DOT_ICONS 12 枚 → lucide 等价（键保留官方图标名）。 */
const DOT_ICONS: Record<string, typeof Check> = {
  CheckOutlined: Check,
  ClockCircleOutlined: Clock,
  CloseOutlined: X,
  EditOutlined: Pen,
  ExclamationCircleOutlined: CircleAlert,
  ExportOutlined: Undo2,
  FileAddOutlined: FilePlus,
  HourglassOutlined: Hourglass,
  PlusOutlined: Plus,
  RollbackOutlined: Undo2,
  StopOutlined: Ban,
  UndoOutlined: Undo2,
};

interface DotMeta {
  color?: string;
  icon?: string;
  labelKey?: string;
}

/** RECORD_STATUS_META dot 子集（v2 models/shared.js:63-74，面 C 施工提示表）。 */
const RECORD_DOT_META: Record<string, DotMeta> = {
  // ASSIGNED(null)=蓝/Hourglass
  null: { color: "blue", icon: "HourglassOutlined", labelKey: "approval.recordStatus.assigned" },
  "0": { color: "gold", icon: "ClockCircleOutlined", labelKey: "approval.recordStatus.pending" },
  "1": { color: "purple", icon: "RollbackOutlined", labelKey: "approval.recordStatus.returned" },
  "2": { color: "green", icon: "CheckOutlined", labelKey: "approval.recordStatus.approved" },
  "-1": { color: "red", icon: "CloseOutlined", labelKey: "approval.recordStatus.rejected" },
  "-2": { icon: "StopOutlined", labelKey: "approval.recordStatus.canceled" },
  "-3": { icon: "UndoOutlined", labelKey: "approval.recordStatus.withdrawn" },
  "3": { labelKey: "approval.recordStatus.unprocessed" },
  "8": { color: "geekblue", icon: "ExportOutlined", labelKey: "approval.recordStatus.delegated" },
  "99": { icon: "PlusOutlined", labelKey: "approval.recordStatus.added" },
};

/** APPROVAL_STATUS_META 终态 dot 子集（v2 models/shared.js:52-61）。 */
const APPROVAL_DOT_META: Record<string, DotMeta> = {
  "-2": { color: "magenta", icon: "ExclamationCircleOutlined", labelKey: "approval.status.failed" },
  "-3": { color: "volcano", icon: "StopOutlined", labelKey: "approval.status.aborted" },
};

/** C-16 发起成功 dot 常量（approvalTimeline.jsx:370）。 */
const INITIATED_DOT: Required<Pick<DotMeta, "color" | "icon">> & { label: string } = {
  color: "green",
  icon: "CheckOutlined",
  label: "approval.timeline.initiatedSuccessfully",
};

/** job 状态 → 审批记录状态（官方 `T`，approvalTimeline.jsx:342-349）。 */
const JOB_STATUS_TO_RECORD: Record<number, number> = {
  0: 0, // PENDING
  1: 2, // APPROVED
  [-5]: -1, // REJECTED
  [-6]: 1, // RETURNED
  [-4]: -2, // CANCELED
};

/** 终态 execution 状态（官方 `O`，approvalTimeline.jsx:352-355）。 */
const ROUND_TERMINAL: Record<number, number> = {
  [-1]: -2, // FAILED
  [-3]: -3, // ABORTED
};

/** APPROVED/REJECTED/RETURNED/DELEGATED 才显示处理时间（approvalTimeline.jsx:363-368）。 */
const STATUSES_WITH_TIME = new Set<number>([2, -1, 1, 8]);

/**
 * C-17 状态圆点 → reui TimelineIndicator（16px border-2 圆点 + 轨道定位）。
 * 语义色覆盖：color 有值时 border 透明 + tagColorClass 皮肤；completed 态由
 * reui data-completed 接管描边（border-current 语义色强化）。无 color 的中性
 * 状态走 reui 默认（border-primary/20 → completed border-primary）。
 */
function TimelineDot({ meta }: { meta: DotMeta | undefined }) {
  const translate = useTranslate();
  const label = meta?.labelKey
    ? translate(meta.labelKey, { ns: "app" }, meta.labelKey)
    : "-";
  const Icon = meta?.icon ? DOT_ICONS[meta.icon] : undefined;
  return (
    <TimelineIndicator
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center",
        meta?.color
          ? cn(
              "border-transparent group-data-completed/timeline-item:border-current",
              tagColorClass(meta.color)
            )
          : undefined
      )}
    >
      {Icon ? <Icon className="size-2.5" aria-hidden /> : null}
    </TimelineIndicator>
  );
}

// --------------------------------------------------------- C-18 协商模式 Pill

function negotiationLabel(
  node: TimelineNode | null | undefined,
  translate: (key: string, opts?: unknown, fallback?: string) => string
): string {
  const raw = node?.config?.negotiation;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n === 1) return translate("approval.timeline.and", { ns: "app" }, "And");
  if (n > 0 && n < 1)
    return `${translate("approval.timeline.voting", { ns: "app" }, "Voting")} ( > ${(n * 100).toFixed(0)}%)`;
  return translate("approval.timeline.or", { ns: "app" }, "Or");
}

function NegotiationPill({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-foreground/50 px-1.5 font-normal text-background"
    >
      {label}
    </Badge>
  );
}

// ------------------------------------------------------------- C-19 时间文本

function TimeText({ value }: { value: unknown }) {
  const text = strVal(value);
  if (!text) return null;
  return (
    <time dateTime={text} className="whitespace-nowrap text-[85%] text-muted-foreground">
      {formatDateTime(text)}
    </time>
  );
}

// ------------------------------------------- C-23~C-26 单轮 entry 序列（reui）

interface RoundTimelineProps extends Omit<ApprovalTimelineProps, "source"> {
  approval: Record<string, unknown>;
  round: Record<string, unknown>;
  index: number;
  roundCount: number;
  translate: (key: string, opts?: unknown, fallback?: string) => string;
}

/** 单条时间线项：数据语义沿用 v2（dot/date/title/content 四段 → reui 子组件）。 */
interface TimelineEntry {
  key: string;
  /** data-completed 判定（reui step ≤ activeStep）：驱动 dot 描边与轨道推进。 */
  completed: boolean;
  meta: DotMeta | undefined;
  /** TimelineDate（原文 ISO 串，作 dateTime 属性）。 */
  date?: string;
  /** 日期行右缘：job 耗时 / 多轮 Round 徽标。 */
  dateEnd?: ReactNode;
  title?: ReactNode;
  /** 标题行右缘：协商模式 Pill。 */
  titleExtra?: ReactNode;
  /** C-22 契约：actionEnabled 命中本人记录时经 renderActionCard 托管整段。 */
  action?: TimelineAction;
  /** C-22 契约形态：托管渲染时透传 {title, extra}。 */
  cardProps: { title?: string; extra?: ReactNode };
  content: ReactNode;
}

function RoundTimeline({
  approval,
  round,
  index,
  roundCount,
  currentUserId,
  actionEnabled = false,
  renderActionCard,
  translate,
}: RoundTimelineProps) {
  const t = (key: string, fallback: string) =>
    translate(key, { ns: "app" }, fallback);
  const entries: TimelineEntry[] = [];

  const applyKey = stableKey([
    "submitted",
    approval?.id,
    round?.id,
    round?.status,
    round?.createdAt,
    round?.updatedAt,
    round?.applicant,
  ]);
  const applicant = round?.applicant as TimelineUser | undefined;
  // C-23：createdById===currentUserId 且 actionEnabled 时 Apply 卡挂 {kind:'application'}
  const applyActionEnabled =
    actionEnabled &&
    approval?.id != null &&
    sameStr(approval?.createdById ?? (applicant as TimelineUser | undefined)?.id, currentUserId);
  entries.push({
    key: applyKey,
    completed: true,
    meta: { ...INITIATED_DOT, labelKey: INITIATED_DOT.label },
    date: strVal(round?.createdAt) ?? undefined,
    dateEnd:
      roundCount > 1 ? (
        <Badge variant="outline" className="shrink-0 bg-muted font-normal text-muted-foreground">
          {t("approval.timeline.round", "Round {{round}}").replace(
            "{{round}}",
            String(index + 1)
          )}
        </Badge>
      ) : undefined,
    title: t("approval.timeline.apply", "Apply"),
    action: applyActionEnabled
      ? {
          kind: "application",
          record: {
            id: approval?.id,
            latestExecutionId: round?.id,
            workflow: approval?.workflow,
          },
        }
      : undefined,
    cardProps: { title: t("approval.timeline.apply", "Apply") },
    content: renderUser(applicant, t("approval.timeline.userNotFound", "User not found")),
  });

  // 2) job 节点（C-24）
  for (const rawJob of objArray(round?.jobs)) {
    const job = rawJob as unknown as TimelineJob;
    const status = toNum(job?.status, 0);
    const dotOption =
      RECORD_DOT_META[String(JOB_STATUS_TO_RECORD[status] ?? 0)] ?? RECORD_DOT_META["0"];
    const myRecord = actionEnabled
      ? objArray(job?.records)
          .map((r) => r as unknown as TimelineRecord)
          .find(
            (record) =>
              record?.id != null &&
              record?.status !== -3 /* WITHDRAWN */ &&
              sameStr(record?.userId, currentUserId)
          )
      : undefined;
    const jobKey = stableKey([
      "job",
      approval?.id,
      round?.id,
      job?.id,
      job?.status,
      job?.createdAt,
      job?.updatedAt,
      job?.node?.id,
      job?.node?.title,
      job?.records,
    ]);
    const negotiation = negotiationLabel(job?.node, translate);
    const createdText = strVal(job?.createdAt);
    entries.push({
      key: jobKey,
      // job.status 0=PENDING → 未完成（reui data-completed 驱动轨道推进）
      completed: status !== 0,
      meta: dotOption,
      date: createdText ?? undefined,
      dateEnd:
        createdText && status !== 0 ? (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
            aria-label={t("approval.timeline.duration", "Duration")}
          >
            <Clock className="size-3" aria-hidden />
            <time>
              {dayjs(createdText).isValid()
                ? relativeFrom(dayjs(strVal(job?.updatedAt)), dayjs(createdText), true)
                : "-"}
            </time>
          </span>
        ) : undefined,
      title: strVal(job?.node?.title) ?? "-",
      titleExtra: <NegotiationPill label={negotiation} />,
      action: myRecord
        ? { kind: "approvalRecord", record: myRecord as unknown as Record<string, unknown> }
        : undefined,
      cardProps: {
        title: strVal(job?.node?.title) ?? "-",
        extra: <NegotiationPill label={negotiation} />,
      },
      content: (
        <div className="flex w-full min-w-0 flex-col">
          {objArray(job?.records).map((rawRecord, recordIndex) => {
            const record = rawRecord as unknown as TimelineRecord;
            const recordMeta = RECORD_DOT_META[String(record?.status)];
            const delegatedUser = record?.delegatedTo?.user;
            const addedUsers = (record?.added ?? []).filter(
              (item: TimelineRecord) => item?.user
            );
            const comment = commentText(record?.comment);
            const hasExtras = !!(comment || delegatedUser || addedUsers.length);
            return (
              <div
                key={strOrNull(record?.id) ?? recordIndex}
                className="flex w-full min-w-0 flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {renderUser(
                      record?.user,
                      t("approval.timeline.userNotFound", "User not found")
                    )}
                    {/* v2 记录行状态为带文字 Tag（:643-650），非时间线圆点 */}
                    {recordMeta ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          recordMeta.color ? tagColorClass(recordMeta.color) : undefined
                        )}
                      >
                        {recordMeta.labelKey
                          ? translate(recordMeta.labelKey, { ns: "app" }, recordMeta.labelKey)
                          : null}
                      </Badge>
                    ) : null}
                  </span>
                  {STATUSES_WITH_TIME.has(Number(record?.status)) ? (
                    <TimeText value={record?.updatedAt} />
                  ) : null}
                </div>
                {hasExtras ? (
                  <div className="flex w-full min-w-0 flex-col gap-1">
                    {delegatedUser ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>
                          {t("approval.timeline.delegatedTo", "Delegated to")}:
                        </span>
                        {renderUser(
                          delegatedUser,
                          t("approval.timeline.userNotFound", "User not found")
                        )}
                      </div>
                    ) : null}
                    {addedUsers.length ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>
                          {t("approval.timeline.assigneesAdded", "Assignees added")}:
                        </span>
                        {addedUsers.map((item, itemIndex) => (
                          <Fragment key={strOrNull(item?.id) ?? itemIndex}>
                            {renderUser(
                              item?.user,
                              t("approval.timeline.userNotFound", "User not found")
                            )}
                          </Fragment>
                        ))}
                      </div>
                    ) : null}
                    {comment ? (
                      <blockquote className="w-full rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-foreground/80 [overflow-wrap:anywhere]">
                        {comment}
                      </blockquote>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ),
    });
  }

  // 3) 撤回节点（C-25，round.status === -4）
  if (Number(round?.status) === -4) {
    entries.push({
      key: stableKey(["withdrawn", round?.id, round?.updatedAt]),
      completed: true,
      meta: RECORD_DOT_META["-3"],
      date: strVal(round?.updatedAt) ?? undefined,
      title: t("approval.timeline.withdrawn", "Withdrawn"),
      cardProps: { title: t("approval.timeline.withdrawn", "Withdrawn") },
      content: renderUser(
        round?.applicant as TimelineUser | undefined,
        t("approval.timeline.userNotFound", "User not found")
      ),
    });
  }

  // 4) 终态节点（C-26：execution failed / aborted + reason）
  const terminalStatus = ROUND_TERMINAL[toNum(round?.status, 0)];
  if (terminalStatus) {
    const terminalMeta = APPROVAL_DOT_META[String(terminalStatus)];
    const reason = round?.reason;
    const reasonLabelKey =
      reason === "timeout"
        ? "approval.timeline.timedOut"
        : reason === "manual_cancel"
          ? "approval.timeline.canceledManually"
          : reason === "parent_aborted"
            ? "approval.timeline.abortedWithParent"
            : undefined;
    const terminalTitle = terminalMeta?.labelKey
      ? translate(terminalMeta.labelKey, { ns: "app" }, terminalMeta.labelKey)
      : "-";
    entries.push({
      key: stableKey(["terminal", round?.id, terminalStatus, round?.updatedAt]),
      completed: true,
      meta: terminalMeta,
      date: strVal(round?.updatedAt) ?? undefined,
      title: terminalTitle,
      cardProps: { title: terminalTitle },
      content: (
        <div className="flex flex-col gap-1">
          {renderUser(
            { id: "system", nickname: t("approval.timeline.system", "System") },
            t("approval.timeline.userNotFound", "User not found")
          )}
          {reasonLabelKey ? (
            <p className="text-sm">{translate(reasonLabelKey, { ns: "app" }, reasonLabelKey)}</p>
          ) : strVal(reason) ? (
            <p className="text-sm">{strVal(reason)}</p>
          ) : null}
        </div>
      ),
    });
  }

  // reui 步进语义：已完成项计数作为受控 activeStep（step ≤ activeStep →
  // data-completed），驱动 dot 描边与轨道推进；数据变化时 value 随渲染重算。
  const completedCount = entries.filter((entry) => entry.completed).length;
  return (
    <Timeline value={completedCount} className="w-full">
      {entries.map((entry, entryIndex) => {
        const body = (
          <>
            {entry.date ? (
              <TimelineHeader className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <TimelineDate dateTime={entry.date} className="mb-0 whitespace-nowrap">
                  {formatDateTime(entry.date)}
                </TimelineDate>
                {entry.dateEnd}
              </TimelineHeader>
            ) : null}
            {entry.title != null || entry.titleExtra != null ? (
              <TimelineHeader className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                {entry.title != null ? <TimelineTitle>{entry.title}</TimelineTitle> : null}
                {entry.titleExtra}
              </TimelineHeader>
            ) : null}
            <TimelineContent className="w-full min-w-0">{entry.content}</TimelineContent>
          </>
        );
        return (
          <TimelineItem key={entry.key} step={entryIndex + 1}>
            <TimelineDot meta={entry.meta} />
            <TimelineSeparator />
            {
              // C-22：托管渲染保持 {action, cardKey, cardProps:{title,extra}, children}
              entry.action && renderActionCard
                ? renderActionCard({
                    action: entry.action,
                    cardKey: entry.key,
                    cardProps: entry.cardProps,
                    children: body,
                  })
                : body
            }
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}

// ------------------------------------- C-27 collectRounds（草稿回退 null/[]）

/** 轮次归集（approvalTimeline.jsx:781-799）：approval.rounds 优先，latestRound/execution 回退。 */
function collectRounds(
  source: Record<string, unknown>,
  approval: Record<string, unknown>
): Record<string, unknown>[] {
  const stored = objArray(approval?.rounds);
  if (stored.length) return stored;
  const latestRound = isObj(approval?.latestRound)
    ? approval.latestRound
    : isObj(source?.latestRound)
      ? source.latestRound
      : undefined;
  const execution = isObj(latestRound?.execution)
    ? latestRound.execution
    : isObj(source?.execution)
      ? source.execution
      : undefined;
  if (latestRound || execution) {
    return [
      {
        ...(isObj(execution) ? execution : {}),
        ...(isObj(latestRound) ? latestRound : {}),
        createdAt: latestRound?.createdAt ?? execution?.createdAt ?? source?.createdAt,
        id: latestRound?.id ?? execution?.id ?? source?.id,
        status: latestRound?.status ?? execution?.status,
        updatedAt: latestRound?.updatedAt ?? execution?.updatedAt,
      },
    ];
  }
  return [];
}

// --------------------------- C-28 ApprovalTimeline 主组件（records → job 桶聚合）

export function ApprovalTimeline({
  source,
  currentUserId,
  actionEnabled = false,
  renderActionCard,
}: ApprovalTimelineProps) {
  const translate = useTranslate();
  const rawSource = isObj(source) ? source : {};
  const approval = pickApproval(rawSource);
  const nodes = objArray(pathGet(approval, "workflow.nodes")).length
    ? objArray(pathGet(approval, "workflow.nodes"))
    : objArray(pathGet(rawSource, "workflow.nodes"));
  const rounds = collectRounds(rawSource, approval)
    .slice()
    .sort((a, b) => toNum(a?.id, 0) - toNum(b?.id, 0));
  const records = objArray(approval?.records)
    .slice()
    .sort(
      (a, b) =>
        toNum(a?.jobId, 0) - toNum(b?.jobId, 0) || toNum(a?.index, 0) - toNum(b?.index, 0)
    );

  const roundEntries = rounds.map((round, roundIndex) => {
    const createdBy = approval?.createdBy as TimelineUser | undefined;
    return {
      ...round,
      id: round?.id ?? `round-${roundIndex}`,
      applicant: {
        ...(isObj(createdBy) ? createdBy : {}),
        id: numeric(approval?.createdById) ?? numeric(createdBy?.id),
      },
      jobs: [] as Record<string, unknown>[],
    };
  });
  const roundEntryMap = new Map(roundEntries.map((entry) => [strOrNull(entry.id), entry]));
  const roundMap = new Map(rounds.map((round) => [strOrNull(round?.id), round]));

  for (const record of records) {
    const entry = roundEntryMap.get(strOrNull(record?.approvalExecutionId));
    const rawRound = roundMap.get(strOrNull(record?.approvalExecutionId));
    if (!entry || !rawRound) continue;
    const jobId = record?.jobId ?? pathGet(record, "job.id");
    let bucket = entry.jobs.find((job) => sameStr(job?.id, jobId));
    if (!bucket) {
      const jobFromRecord = isObj(record?.job) ? record.job : undefined;
      const jobFromRound = jobsOf(rawRound).find((job) => sameStr(job?.id, jobId));
      const jobData = jobFromRecord ?? jobFromRound;
      bucket = {
        ...(isObj(jobData) ? jobData : {}),
        id: (jobId ?? jobData?.id) as number | string | null | undefined,
        createdAt: jobData?.createdAt ?? record?.createdAt,
        node: findNode(nodes, record, jobData) as unknown as Record<string, unknown>,
        records: [] as unknown[],
        status: jobData?.status,
        updatedAt: jobData?.updatedAt ?? record?.updatedAt,
      };
      entry.jobs.push(bucket);
    }
    const bucketRecords = (bucket.records as unknown[]) ?? [];
    bucketRecords.push(decorateRecordItem(record, records));
    bucket.records = bucketRecords;
  }

  // 无记录回退：round.jobs 或单记录形态（approvalTimeline.jsx:858-890）
  if (!records.length) {
    for (const entry of roundEntries) {
      const rawRound = roundMap.get(strOrNull(entry.id));
      if (!rawRound) continue;
      const roundJobs = jobsOf(rawRound);
      if (roundJobs.length) {
        entry.jobs = roundJobs.map((job, jobIndex) => ({
          ...job,
          id: numeric(job?.id) ?? `job-${jobIndex}`,
          node: (isObj(job?.node) ? job.node : findNode(nodes, job, job)) as unknown as Record<
            string,
            unknown
          >,
          records: objArray(job?.records).map((record) => decorateRecordItem(record, [])),
        }));
        continue;
      }
      if (isObj(rawRound?.node)) {
        entry.jobs = [
          {
            createdAt: rawRound?.createdAt,
            id: (pathGet(rawRound, "job.id") ?? rawRound?.id) as number | string,
            node: rawRound?.node as unknown as Record<string, unknown>,
            records: [
              decorateRecordItem({ ...rawRound, user: rawRound?.user }, []),
            ] as unknown[],
            status: pathGet(rawRound, "job.status"),
          },
        ];
      }
    }
  }

  if (!roundEntries.length) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {roundEntries.map((round, roundIndex) => (
        <RoundTimeline
          key={strOrNull(round.id) ?? roundIndex}
          approval={approval}
          round={round}
          index={roundIndex}
          roundCount={roundEntries.length}
          currentUserId={currentUserId}
          actionEnabled={actionEnabled}
          renderActionCard={renderActionCard}
          translate={translate}
        />
      ))}
    </div>
  );
}
