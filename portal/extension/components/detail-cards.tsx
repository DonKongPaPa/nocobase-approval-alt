import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getBusinessRecord,
  getCollectionMeta,
  getFlowModel,
  listFlowModels,
  type ApprovalApplication,
  type ApprovalCollectionField,
  type CollectionMeta,
  type FlowModelNode,
} from "../api";
import { approvalKeys } from "../query-keys";
import {
  APPROVAL_STATUS_TAG,
  RECORD_STATUS_TAG,
  tagColorClass,
  type StatusTagMap,
} from "../shared";
import { StatusTag } from "./status-tag";
import { UserChip, commentText } from "./approval-timeline";

/** 记录状态卡/节点卡标签映射 = 批1 RECORD_STATUS_TAG，仅 ASSIGNED(null) 改官方 META 蓝。 */
export const RECORD_CARD_TAG: StatusTagMap = {
  ...RECORD_STATUS_TAG,
  null: {
    color: "blue",
    labelKey: "approval.recordStatus.assigned",
    icon: "HourglassOutlined",
  },
};

/**
 * 详情业务卡族 — docs/13 面 C 依赖 + 面 B 卡片字段布局施工提示，
 * 对 v2 `models/taskDetailCards.jsx`（module 3557 语义）的 portal 重建：
 *   - BusinessRecordCard（:175-244）：业务记录卡=审批快照 data 字段渲染（两列栅格
 *     label 上/值下、hasMany 通栏子表、快照关联缺失按 workflow.config.appends 实时补齐）
 *   - TaskNodeCard（:294-356）：最新 job 的记录行卡（与时间线节点卡同构）
 * 批6 详情弹窗重做（shadcn 原生范式）：状态/审批人/处理时间/申请人归并为弹窗内
 * SummaryCard（Card+Separator 紧凑行，见 detail-dialog.tsx），卡片族不再各自成卡堆叠。
 */

// ------------------------------------------------------- collection metadata

const SYSTEM_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "sort",
]);

/** collections:get 字段元数据规整（fields 直传+空数组兜底；v2 的 data.values.fields 双形态未兼容——v3 宿主实测恒为 data.fields）。 */
function normalizeCollectionMeta(meta: CollectionMeta | null | undefined): CollectionMeta | null {
  if (!meta) return null;
  const fields = (meta.fields ?? []).length ? meta.fields : [];
  return { ...meta, fields };
}

function useCollectionMeta(name: string | undefined) {
  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!name) {
      setMeta(null);
      return;
    }
    // 竞态守卫：alive 旗标（v2 fetchCollection/BusinessRecordCard 同款语义）
    let alive = true;
    setLoading(true);
    getCollectionMeta(name)
      .then((response) => {
        if (alive) setMeta(normalizeCollectionMeta(response.data));
      })
      .catch(() => {
        if (alive) setMeta(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [name]);
  return { meta, loading };
}

// ------------------------------------------------------------- value render

/** 日期时间文本（详情卡族/弹窗 SummaryCard 共用；`2026-10-21T08:00:00.000Z` → `2026-10-21 08:00:00`）。 */
export function formatDateTimeText(value: unknown, dateOnly = false): string {
  if (value == null || value === "") return "-";
  const text = String(value);
  return dateOnly ? text.slice(0, 10) : text.slice(0, 19).replace("T", " ");
}

function numberText(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "-");
  return n.toLocaleString("en-US");
}

/** belongsTo 关联标题回退链（taskDetailCards.jsx:95-99）。 */
function assocTitle(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit =
      record.customer_name ??
      record.full_name ??
      record.nickname ??
      record.name ??
      record.title ??
      record.id;
    return hit == null ? "-" : String(hit);
  }
  return String(value);
}

function enumTag(field: ApprovalCollectionField | undefined, value: unknown) {
  const enums = field?.uiSchema?.enum;
  if (!Array.isArray(enums)) return null;
  const hit = enums.find((option) => String(option.value) === String(value));
  if (!hit) return null;
  return (
    <Badge variant="outline" className={tagColorClass(typeof hit.color === "string" ? hit.color : undefined) ?? "font-normal"}>
      {String(hit.label ?? value)}
    </Badge>
  );
}

/** C 面值渲染器（taskDetailCards.jsx:101-121）：enum Tag/日期/千分位/布尔/关联标题回退链。
 *  批15：enum select 值此前漏映射裸奔（"annual"），接上 enumTag 出标签 Badge。 */
export function renderFieldValue(
  field: ApprovalCollectionField | undefined,
  value: unknown
): React.ReactNode {
  if (value === undefined || value === null || value === "") return "-";
  const type = field?.type;
  if (type === "date" || type === "datetime") return formatDateTimeText(value);
  if (type === "dateOnly") return formatDateTimeText(value, true);
  if (
    type === "double" ||
    type === "float" ||
    type === "integer" ||
    type === "bigInt"
  ) {
    return numberText(value);
  }
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "belongsTo") return assocTitle(value);
  if (typeof value === "object") return JSON.stringify(value);
  const tag = enumTag(field, value);
  return tag ?? String(value);
}

// ------------------------------------------------ 子表（hasMany，AssocTable）

const SUB_TABLE_MAX_COLUMNS = 5;
const SUB_TABLE_PAGE_SIZE = 10;

function AssocTable({
  field,
  rows,
}: {
  field: ApprovalCollectionField;
  rows: Record<string, unknown>[];
}) {
  const target = field.target ?? undefined;
  const { meta } = useCollectionMeta(target);
  const [page, setPage] = useState(1);
  const columns = useMemo(() => {
    const fields = (meta?.fields ?? []).filter(
      (f) => !SYSTEM_FIELDS.has(String(f.name)) && f.type !== "virtual"
    );
    return fields.slice(0, SUB_TABLE_MAX_COLUMNS);
  }, [meta]);
  const data = Array.isArray(rows) ? rows : [];
  const totalPages = Math.max(1, Math.ceil(data.length / SUB_TABLE_PAGE_SIZE));
  const pageRows = data.slice(
    (page - 1) * SUB_TABLE_PAGE_SIZE,
    page * SUB_TABLE_PAGE_SIZE
  );
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.name)}>
                {column.uiSchema?.title ?? String(column.name)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row, rowIndex) => (
            <TableRow key={String(row?.id ?? rowIndex)}>
              {columns.map((column) => (
                <TableCell key={String(column.name)}>
                  {renderFieldValue(column, row?.[String(column.name)])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {"<"}
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            {">"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 官方业务卡字段栅格（FieldGrid :153-170）：标签(带尾冒号)在上、值在下，两列。 */
function FieldGrid({
  items,
}: {
  items: Array<{ key: string; label: string; children: React.ReactNode }>;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-x-6 gap-y-3.5 min-[540px]:grid-cols-2">
      {items.map((item) => (
        <div key={item.key} className="min-w-0">
          <div className="mb-1 text-[13px] text-muted-foreground">{item.label} :</div>
          <div className="min-w-0 text-sm [overflow-wrap:anywhere]">{item.children}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------- BusinessRecordCard

/** 业务记录卡（C 面/面 B #14）：审批快照 data 字段渲染 + hasMany 子表 + 快照关联补齐。 */
export function BusinessRecordCard({
  approval,
  head = false,
}: {
  approval: ApprovalApplication | null;
  /** 待办详情带「原始申请内容」头（v2 index.jsx:631 head=t('Original application content')）。 */
  head?: boolean;
}) {
  const translate = useTranslate();
  const config = approval?.workflow?.config ?? {};
  const collectionName = String(config.collection ?? "").split(":").pop() || "";
  const { meta, loading } = useCollectionMeta(collectionName || undefined);
  const appends = Array.isArray(config.appends) ? config.appends : [];

  // 快照关联缺失时按 workflow.config.appends 实时补齐（taskDetailCards.jsx:189-199）
  const [live, setLive] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let alive = true;
    if (!collectionName || approval?.dataKey == null || !appends.length) {
      setLive(null);
      return;
    }
    getBusinessRecord(collectionName, approval.dataKey, appends)
      .then((response) => {
        if (alive) setLive(response.data ?? null);
      })
      .catch(() => {
        if (alive) setLive(null);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, approval?.dataKey]);

  if (loading && !meta) {
    return (
      <div className="flex justify-center py-6">
        <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }
  const snapshot: Record<string, unknown> = { ...((approval?.data as Record<string, unknown>) ?? {}) };
  for (const key of appends) {
    if (snapshot[key] == null && live?.[key] != null) snapshot[key] = live[key];
  }
  const fields = (meta?.fields ?? []).filter(
    (f) =>
      !SYSTEM_FIELDS.has(String(f.name)) &&
      f.type !== "virtual" &&
      f.name !== "space"
  );
  const scalars: Array<{ key: string; label: string; children: React.ReactNode }> = [];
  const tables: Array<{ field: ApprovalCollectionField; rows: Record<string, unknown>[] }> = [];
  for (const field of fields) {
    const value = snapshot[String(field.name)];
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "hasMany" && Array.isArray(value) && value.length) {
      tables.push({ field, rows: value as Record<string, unknown>[] });
    } else {
      scalars.push({
        key: String(field.name),
        label: field.uiSchema?.title ?? String(field.name),
        children: <>{renderFieldValue(field, value)}</>,
      });
    }
  }
  return (
    <Card className="gap-3 py-3">
      {head ? (
        <CardHeader className="px-3 py-0">
          <CardTitle className="text-sm">
            {translate(
              "approval.detail.originalContent",
              { ns: "app" },
              "Original application content"
            )}
          </CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-3.5 px-3">
        {scalars.length ? <FieldGrid items={scalars} /> : null}
        {tables.map(({ field, rows }) => (
          <div key={String(field.name)}>
            <div className="mb-1.5 text-[13px] text-muted-foreground">
              {field.uiSchema?.title ?? String(field.name)} :
            </div>
            <AssocTable field={field} rows={rows} />
          </div>
        ))}
        {!scalars.length && !tables.length ? (
          <p className="text-sm text-muted-foreground">-</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------- TaskNodeCard

/** 当前节点卡（面 B #18）：最新 job 分桶记录行 + 协商 pill + 意见引用块。 */
export function TaskNodeCard({ approval }: { approval: ApprovalApplication | null }) {
  const translate = useTranslate();
  const records = Array.isArray(approval?.records) ? approval.records : [];
  if (!records.length) return null;
  // 按 jobId 分桶取最新 job（taskDetailCards.jsx:298-308）
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const record of records as Record<string, unknown>[]) {
    const key = String(record?.jobId ?? (record?.job as Record<string, unknown>)?.id ?? "");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(record);
  }
  const keys = [...buckets.keys()].sort((a, b) => Number(a || 0) - Number(b || 0));
  const jobRecords = buckets.get(keys[keys.length - 1]) ?? [];
  const first = jobRecords[0] ?? {};
  const node = (first?.node ?? (first?.job as Record<string, unknown>)?.node ?? {}) as {
    title?: string | null;
    config?: { negotiation?: number | string | null } | null;
  };
  const raw = node?.config?.negotiation;
  const n = typeof raw === "number" ? raw : Number(raw);
  const pillLabel =
    n === 1
      ? translate("approval.timeline.and", { ns: "app" }, "And")
      : n > 0 && n < 1
        ? `${translate("approval.timeline.voting", { ns: "app" }, "Voting")} ( > ${(n * 100).toFixed(0)}%)`
        : translate("approval.timeline.or", { ns: "app" }, "Or");
  return (
    <Card className="gap-2 py-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-3 py-0">
        <CardTitle className="min-w-0 truncate text-sm font-medium">
          {node?.title ?? "-"}
        </CardTitle>
        <Badge
          variant="outline"
          className="shrink-0 border-transparent bg-foreground/50 font-normal text-background"
        >
          {pillLabel}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3">
        {jobRecords.map((record, index) => {
          const comment = commentText(record?.comment);
          return (
            <div
              key={String(record?.id ?? index)}
              className="flex min-w-0 flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <UserChip
                    data={(record?.user ?? null) as ApprovalApplication["createdBy"]}
                    fallback="-"
                  />
                  <StatusTag
                    value={(record?.status as number | null | undefined) ?? null}
                    map={RECORD_CARD_TAG}
                  />
                </span>
                {record?.updatedAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTimeText(record.updatedAt)}
                  </span>
                ) : null}
              </div>
              {comment ? (
                <blockquote className="w-full rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-foreground/80 [overflow-wrap:anywhere]">
                  {comment}
                </blockquote>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------- 列表行内任务卡速览（面 B #19/#20）

interface TaskCardItem {
  uid: string;
  fieldPath?: string;
  collectionName?: string;
  isJs: boolean;
}

/**
 * 任务卡 items 装配器（taskDetailCards.jsx:363-396）：flowModels:get{filterByTk:uid}
 * 树顶 + flowModels:list 建父子树 → Grid 行下 /ItemModel|JSItemModel/ 项按 sortIndex 排序；
 * items 以 taskCardUid 为粒度 React Query 缓存（v2 taskCardCache Map 等价）。
 */
async function fetchTaskCardItems(uid: string): Promise<TaskCardItem[]> {
  const top = await getFlowModel(uid);
  const rootUid = top.data?.uid;
  if (!rootUid) return [];
  const all = await listFlowModels();
  const byParent = new Map<string, FlowModelNode[]>();
  for (const model of all.data ?? []) {
    const key = String(model.parentId ?? "");
    const bucket = byParent.get(key) ?? [];
    bucket.push(model);
    byParent.set(key, bucket);
  }
  const siblings = byParent.get(rootUid) ?? [];
  const grid =
    siblings.find((model) => /GridModel/.test(String(model.use ?? ""))) ??
    siblings[0];
  const rawItems = grid ? (byParent.get(grid.uid) ?? []) : [];
  return rawItems
    .filter((model) => /ItemModel|JSItemModel/.test(String(model.use ?? "")))
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((model) => ({
      uid: model.uid,
      fieldPath: model.stepParams?.fieldSettings?.init?.fieldPath,
      collectionName: model.stepParams?.fieldSettings?.init?.collectionName,
      isJs: /JSItemModel/.test(String(model.use ?? "")),
    }));
}

/**
 * 列表卡任务卡字段栅格（TaskCardFields，taskDetailCards.jsx:432-495）：
 * 按 approval.workflow.config.taskCardUid 渲染配置字段——status→审批状态 Tag、
 * createdAt/updatedAt→时间文本、data.*→业务集合 fieldMap 标题+类型渲染、其余直取
 * approval 列（taskCardFieldValue :399-406）；JS 自定义项跳过（:467）；末尾固定追加
 * 「Last updated at」；无 items 不渲染。我的申请/我的审批列表行内速览共用。
 */
export function TaskCardFields({ approval }: { approval: ApprovalApplication | null }) {
  const translate = useTranslate();
  const uid = strValOf(approval?.workflow?.config?.taskCardUid);
  const query = useQuery({
    queryKey: approvalKeys.taskCardItems(uid ?? ""),
    enabled: !!uid,
    queryFn: () => fetchTaskCardItems(uid as string),
    staleTime: 60_000,
  });
  // 业务集合名剥离多数据源前缀（taskDetailCards.jsx:447 split(':').pop()，BusinessRecordCard 同款）
  const bizCollection =
    strValOf(approval?.workflow?.config?.collection)
      ?.split(":")
      .pop() || undefined;
  const { meta: bizMeta } = useCollectionMeta(bizCollection);
  if (!uid || query.isPending || query.isError) return null;
  const items = query.data ?? [];
  if (!items.length) return null;
  const bizFieldMap = new Map(
    (bizMeta?.fields ?? []).map((field) => [String(field.name), field])
  );
  const rendered: Array<{ key: string; label: string; children: React.ReactNode }> = [];
  for (const item of items) {
    if (item.isJs) continue; // JS 自定义摘要块跳过（:467）
    const fieldPath = item.fieldPath;
    if (!fieldPath) continue;
    const value = fieldPath.startsWith("data.")
      ? (approval?.data as Record<string, unknown> | null | undefined)?.[
          fieldPath.slice(5)
        ]
      : (approval as unknown as Record<string, unknown> | null)?.[fieldPath];
    const bizField = fieldPath.startsWith("data.")
      ? bizFieldMap.get(fieldPath.slice(5))
      : undefined;
    let children: React.ReactNode;
    if (fieldPath === "status") {
      children = <StatusTag value={(value as number | null) ?? null} map={APPROVAL_STATUS_TAG} />;
    } else if (fieldPath === "createdAt" || fieldPath === "updatedAt") {
      children = <>{formatDateTimeText(value)}</>;
    } else if (bizField) {
      children = <>{renderFieldValue(bizField, value)}</>;
    } else {
      children = <>{value == null || value === "" ? "-" : String(value)}</>;
    }
    const label =
      fieldPath === "status"
        ? translate("approval.card.status", { ns: "app" }, "Status")
        : fieldPath === "createdAt"
          ? translate("approval.filter.createdAt", { ns: "app" }, "Created at")
          : fieldPath === "updatedAt"
            ? translate("approval.card.updatedAt", { ns: "app" }, "Last updated at")
            : fieldPath === "id"
              ? "ID"
              : bizField?.uiSchema?.title ?? fieldPath;
    rendered.push({ key: item.uid || fieldPath, label, children });
  }
  if (!rendered.length) return null;
  // 固定追加 Last updated at（:474-477）
  rendered.push({
    key: "__updated",
    label: translate("approval.card.updatedAt", { ns: "app" }, "Last updated at"),
    children: <>{formatDateTimeText(approval?.updatedAt)}</>,
  });
  return (
    <span className="grid w-full grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
      {rendered.map((item) => (
        <span key={item.key} className="flex min-w-0 items-center gap-1">
          <span className="shrink-0 after:content-[':']">{item.label}</span>
          <span className="min-w-0 truncate text-foreground">{item.children}</span>
        </span>
      ))}
    </span>
  );
}

function strValOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== ""
    ? value
    : typeof value === "number"
      ? String(value)
      : undefined;
}
