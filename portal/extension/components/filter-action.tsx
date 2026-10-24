import { useTranslate } from "@refinedev/core";
import { type DateRange } from "react-day-picker";
import { useState } from "react";
import dayjs from "dayjs";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SlidersHorizontal, X } from "lucide-react";

import { readUrlFilter, writeUrlFilter, type UrlFilter } from "../shared";

export interface FilterFieldSpec {
  name: string;
  /** locale key under ns "app" */
  labelKey: string;
  /** English fallback label */
  fallbackLabel: string;
  widget: "multiSelect" | "dateRange";
  options?: Array<{ value: number; label: string }>;
}

type FilterDraftValue = number[] | [string, string] | undefined;
type FilterDraft = Record<string, FilterDraftValue>;

const DATE_FORMAT = "YYYY-MM-DD";

/**
 * A#32 页面级筛选动作：Popover 紧凑表单；multiSelect → 数组直用，
 * dateRange → {$gte, $lte}；apply/reset 写 URL（writeUrlFilter 契约）并刷新列表。
 *
 * 与 v2 的差异（已在 v2 源内预留的方向）：v2 alpha.9 宿主无 reload 通道、
 * 整页 window.location.reload()；v3 portal 有 React Query 通道，
 * 通过 onApplied/onReset 触发列表 refetch（URL 仍按 writeUrlFilter 契约维护）。
 */
export function FilterAction({
  filterKey,
  fields,
  onApplied,
  onReset,
}: {
  filterKey: string;
  fields: FilterFieldSpec[];
  onApplied: (filter: UrlFilter) => void;
  onReset: () => void;
}) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>({});

  const readDraft = () => {
    // A#32：打开时回读 URL 草稿
    const current = readUrlFilter(filterKey) ?? {};
    const next: FilterDraft = {};
    for (const field of fields) {
      const value = current[field.name];
      if (value == null) continue;
      if (field.widget === "dateRange") {
        const range = value as { $gte?: unknown; $lte?: unknown };
        if (range.$gte && range.$lte) {
          next[field.name] = [String(range.$gte), String(range.$lte)];
        }
      } else {
        next[field.name] = Array.isArray(value)
          ? (value as number[])
          : [value as number];
      }
    }
    setDraft(next);
  };

  const apply = () => {
    const filter: UrlFilter = {};
    for (const field of fields) {
      const value = draft[field.name];
      if (value == null) continue;
      if (field.widget === "dateRange") {
        if (Array.isArray(value) && value[0]) {
          filter[field.name] = { $gte: value[0], $lte: value[1] };
        }
      } else if (Array.isArray(value) && value.length) {
        filter[field.name] = value;
      }
    }
    writeUrlFilter(filterKey, filter);
    setOpen(false);
    onApplied(filter);
  };

  const reset = () => {
    setDraft({});
    writeUrlFilter(filterKey, undefined);
    setOpen(false);
    onReset();
  };

  const activeCount = fields.filter((field) => draft[field.name] != null).length;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) readDraft();
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" aria-label={translate("approval.actions.filter", { ns: "app" }, "Filter")}>
            <SlidersHorizontal />
            {translate("approval.actions.filter", { ns: "app" }, "Filter")}
            {activeCount > 0 ? (
              <span className="ms-0.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent className="w-64 space-y-3" align="start">
        {fields.map((field) => {
          const value = draft[field.name];
          return (
            <div key={field.name} className="space-y-1.5">
              <div className="text-sm text-muted-foreground">
                {translate(field.labelKey, { ns: "app" }, field.fallbackLabel)}
              </div>
              {field.widget === "dateRange" ? (
                <DateRangeField
                  value={
                    Array.isArray(value) && typeof value[0] === "string"
                      ? (value as [string, string])
                      : undefined
                  }
                  onChange={(range) =>
                    setDraft((prev) => ({ ...prev, [field.name]: range }))
                  }
                />
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto p-1">
                  {(field.options ?? []).map((option) => {
                    const selectedValues =
                      Array.isArray(value) && typeof value[0] === "number"
                        ? (value as number[])
                        : undefined;
                    const selected = selectedValues?.includes(option.value) ?? false;
                    return (
                      <Label
                        key={String(option.value)}
                        className="flex cursor-pointer items-center gap-2 py-0.5 font-normal"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            setDraft((prev) => {
                              const current = Array.isArray(prev[field.name])
                                ? (prev[field.name] as number[])
                                : [];
                              return {
                                ...prev,
                                [field.name]: checked
                                  ? [...current, option.value]
                                  : current.filter((v) => v !== option.value),
                              };
                            });
                          }}
                        />
                        {option.label}
                      </Label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={reset}>
            <X />
            {translate("approval.actions.reset", { ns: "app" }, "Reset")}
          </Button>
          <Button
            size="sm"
            className="ms-auto"
            onClick={apply}
          >
            {translate("approval.actions.filter", { ns: "app" }, "Filter")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateRangeField({
  value,
  onChange,
}: {
  value?: [string, string];
  onChange: (value: [string, string] | undefined) => void;
}) {
  const translate = useTranslate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = value
    ? { from: dayjs(value[0]).toDate(), to: dayjs(value[1]).toDate() }
    : undefined;
  const label = value
    ? `${value[0]} → ${value[1]}`
    : translate("approval.filter.pickDateRange", { ns: "app" }, "Pick a date range");

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="h-8 w-full justify-start font-normal"
          >
            <span className="truncate">{label}</span>
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={1}
          selected={selected}
          onSelect={(range) => {
            if (range?.from && range?.to) {
              onChange([
                dayjs(range.from).format(DATE_FORMAT),
                dayjs(range.to).format(DATE_FORMAT),
              ]);
              setPickerOpen(false);
            } else {
              onChange(undefined);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
