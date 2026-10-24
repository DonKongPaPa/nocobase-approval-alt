import { useTranslate } from "@refinedev/core";
import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  Edit,
  FilePlus,
  Hourglass,
  Plus,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { tagColorClass, type StatusTagMap } from "../shared";

/**
 * H29 StatusTag：命中映射出彩色 Tag，未命中回落 outline + 原值
 * （v2 statusTag 兜底 `String(value ?? '-')`，克隆自实现）。
 * 面 B#21：META 命中项附带官方图标（v2 models/shared.js:52-83 icon 字段 →
 * taskDetailCards.jsx metaTag 渲染 icons[meta.icon]，:407-427）。
 */
const META_ICONS: Record<string, LucideIcon> = {
  CheckOutlined: Check,
  ClockCircleOutlined: Clock,
  CloseOutlined: X,
  EditOutlined: Edit,
  ExclamationCircleOutlined: CircleAlert,
  ExportOutlined: Undo2,
  FileAddOutlined: FilePlus,
  HourglassOutlined: Hourglass,
  PlusOutlined: Plus,
  RollbackOutlined: Undo2,
  StopOutlined: Ban,
  UndoOutlined: Undo2,
};

/**
 * 批8：待处理数角标——复用 StatusTag 同族元素（官方 Badge outline + tagColorClass
 * 皮肤 + Clock 图标，即「⏱ 待处理」金色标签的红皮肤变体），内容「有 X 条待处理」。
 * 消费方：侧边栏「我的审批」resource.meta.badge（壳以官方 SidebarMenuBadge 定位）。
 */
export function PendingCountTag({ count }: { count: number }) {
  const translate = useTranslate();
  return (
    <Badge variant="outline" className={cn("font-normal", tagColorClass("red"))}>
      <Clock className="size-3" aria-hidden />
      {translate(
        "approval.sidebar.pendingCount",
        { ns: "app", x: count },
        `${count} pending`
      )}
    </Badge>
  );
}

export function StatusTag({
  value,
  map,
}: {
  value: number | string | null | undefined;
  map: StatusTagMap;
}) {
  const translate = useTranslate();
  const meta = map[String(value)];
  if (!meta) {
    return (
      <Badge variant="outline" className="font-normal">
        {value === null || value === undefined ? "-" : String(value)}
      </Badge>
    );
  }
  const colorClass = tagColorClass(meta.color);
  const Icon = meta.icon ? META_ICONS[meta.icon] : undefined;
  return (
    <Badge variant="outline" className={cn("font-normal", colorClass)}>
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {translate(meta.labelKey, { ns: "app" }, meta.labelKey)}
    </Badge>
  );
}
