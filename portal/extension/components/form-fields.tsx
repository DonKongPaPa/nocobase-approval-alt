import { useTranslate } from "@refinedev/core";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import {
  getCollectionMeta,
  type ApprovalCollectionField,
  type CollectionMeta,
} from "../api";
import { approvalKeys } from "../query-keys";
import { splitCollectionName } from "../shared";
import type { FormFieldSpec } from "../form-models";

/**
 * 统一表单字段渲染器 — docs/13 面 D#13/#16-#23 的 portal 重建：
 *
 * v2 的 PatternFormFieldModel/PatternFormItemModel/PatternDetailsItemModel/Pattern*SubTable*
 * 九模型族在 portal 无 flowEngine 模型基类，收敛为一个双模式渲染器：
 *   - edit 模式（pattern==='edit'）：可编辑控件，必填/枚举/组件语义取 uiSchema
 *     （D#16「必填/校验语义取 uiSchema」）；
 *   - details 模式（D#5 isDetailsPattern→Display 族切换，:241-243/:324-327/:369-372）：
 *     全字段只读渲染（D#19 DisplayFieldRenderer 等价），关联字段标题回退链与子表只读
 *     表格（D#17/#21/#22 的 portal 等价——details 展示不做编辑穿透）。
 *
 * 已登记 portal 等价差异：关联字段编辑用「ID 直填（target 提示）」（v2 RecordPicker/
 * Select 服务端选择器 portal 未复刻）；子表编辑列（D#20/#21 fork 禁用穿透）只读展示。
 */

const DATE_INTERFACES = new Set([
  "datetime",
  "dateOnly",
  "datetimeNoz",
  "datetimeNoTz",
  "createdAt",
  "updatedAt",
]);
const NUMBER_INTERFACES = new Set(["integer", "number", "percent"]);
const SELECT_INTERFACES = new Set(["select", "radioGroup"]);
const BOOLEAN_INTERFACES = new Set(["checkbox", "boolean"]);
const TEXTAREA_INTERFACES = new Set(["textarea", "markdown", "richText", "json"]);
const ASSOCIATION_TYPES = new Set([
  "belongsTo",
  "hasOne",
  "hasMany",
  "belongsToMany",
  "m2o",
  "o2o",
  "o2m",
  "m2m",
]);

// ------------------------------------------------------------- 元数据 hook

export type FieldMetaResolver = (
  field: FormFieldSpec
) => ApprovalCollectionField | undefined;

interface FieldMetaState {
  map: Record<string, ApprovalCollectionField | undefined>;
  loading: boolean;
}

export interface FieldMetaHookResult {
  resolveField: FieldMetaResolver;
  loading: boolean;
}

/** D#16 字段元数据解析（v2 context.collectionField 的 portal 等价：collections:get）。 */
export function useFormFieldMeta(fields: FormFieldSpec[]): FieldMetaHookResult {
  const [state, setState] = useState<FieldMetaState>({ map: {}, loading: false });
  const names = useMemo(
    () =>
      [
        ...new Set(
          fields
            .map((field) => field.collectionName)
            .filter((name): name is string => Boolean(name))
        ),
      ].sort(),
    // 名单按集合名聚合，与字段对象逐项无关
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields.map((field) => field.collectionName ?? "").join("|")]
  );
  useEffect(() => {
    if (!names.length) {
      setState({ map: {}, loading: false });
      return;
    }
    let alive = true;
    setState((prev) => ({ ...prev, loading: true }));
    Promise.all(
      names.map((name) =>
        getCollectionMeta(name)
          .then((response) => [name, response.data ?? null] as const)
          .catch(() => [name, null] as const)
      )
    ).then((entries) => {
      if (!alive) return;
      const next: Record<string, ApprovalCollectionField | undefined> = {};
      for (const [name, meta] of entries) {
        for (const field of (meta as CollectionMeta | null)?.fields ?? []) {
          if (field.name) next[`${name}.${field.name}`] = field;
        }
      }
      setState({ map: next, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [names]);
  const resolveField: FieldMetaResolver = (field) => {
    if (!field.collectionName) return undefined;
    const [ds, name] = splitCollectionName(field.collectionName);
    // 关联子路径（user.nickname）按顶层字段解析元数据
    const topPath = field.fieldPath.split(".")[0];
    return (
      state.map[`${ds}:${name}.${field.fieldPath}`] ??
      state.map[`${name}.${field.fieldPath}`] ??
      state.map[`${ds}:${name}.${topPath}`] ??
      state.map[`${name}.${topPath}`]
    );
  };
  return { resolveField, loading: state.loading };
}

// -------------------------------------------------------------- D#16 必填校验

export function fieldRequired(meta: ApprovalCollectionField | undefined): boolean {
  return (
    !!meta?.uiSchema?.required || !!meta?.uiSchema?.["x-component-props"]?.required
  );
}

/**
 * 必填判定（批5c 面 F 扩展）：FormFieldSpec.required 设计器覆盖优先
 * （true 强制 / false 豁免 / undefined 跟随集合 uiSchema——批3 行为不变）。
 */
export function isFieldRequired(
  field: FormFieldSpec,
  meta: ApprovalCollectionField | undefined
): boolean {
  return field.required === undefined ? fieldRequired(meta) : field.required;
}

/**
 * 批5c 面 F 控件覆盖映射：fieldSettings.init.xComponent（设计器选择）→
 * FieldEditor 的 interface 通道名。undefined/未知值回落集合元数据推断。
 */
const X_COMPONENT_FACES: Record<string, string> = {
  input: "input",
  textarea: "textarea",
  number: "number",
  integer: "integer",
  percent: "percent",
  datetime: "datetime",
  dateOnly: "dateOnly",
  email: "email",
  switch: "checkbox",
  radioGroup: "radioGroup",
  select: "select",
  multipleSelect: "selectMultiple",
};

/** 设计器控件覆盖生效面：xComponent 非空且在映射表内才接管（自动=undefined 走推断）。 */
export function effectiveFieldFace(
  field: FormFieldSpec,
  meta: ApprovalCollectionField | undefined
): string {
  const override = X_COMPONENT_FACES[field.xComponent ?? ""];
  return override ?? meta?.interface ?? "";
}

/**
 * D#26 validateActionForm portal 等价：逐字段 uiSchema 必填校验（设计器覆盖优先）。
 * skipValidator===true 的动作跳过（:972-973）。
 */
export function validateFormFields(
  fields: FormFieldSpec[],
  resolveField: FieldMetaResolver,
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!isFieldRequired(field, resolveField(field))) continue;
    const value = values[field.fieldPath];
    if (value === undefined || value === null || value === "") {
      errors[field.fieldPath] = "required";
    }
  }
  return errors;
}

// ------------------------------------------------------------- 值只读渲染

function formatDateTimeText(value: unknown, dateOnly = false): string {
  if (value == null || value === "") return "-";
  const text = String(value);
  return dateOnly ? text.slice(0, 10) : text.slice(0, 19).replace("T", " ");
}

function numberText(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "-");
  return n.toLocaleString("en-US");
}

/** D#17 关联字段展示回退链（taskDetailCards assocTitle 同源语义）。 */
function assocTitle(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "object" && !Array.isArray(value)) {
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

const SYSTEM_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "sort",
]);

/** 只读值渲染（D#19 DisplayFieldRenderer 等价；enum 带色 Badge、日期/数字/布尔格式化）。 */
export function DisplayValue({
  field,
  value,
}: {
  field: ApprovalCollectionField | undefined;
  value: unknown;
}) {
  const type = field?.type;
  if (value === undefined || value === null || value === "") {
    return <span className="text-muted-foreground">-</span>;
  }
  const enums = field?.uiSchema?.enum;
  if (Array.isArray(enums)) {
    const hits = (Array.isArray(value) ? value : [value])
      .map((item) =>
        enums.find((option) => String(option.value) === String(item))
      )
      .filter(Boolean);
    if (hits.length) {
      return (
        <span className="inline-flex flex-wrap gap-1">
          {hits.map((hit, index) => (
            <Badge
              key={index}
              variant="outline"
              className="font-normal"
            >
              {String(hit!.label ?? hit!.value)}
            </Badge>
          ))}
        </span>
      );
    }
  }
  if (type === "date" || type === "datetime") {
    return <>{formatDateTimeText(value)}</>;
  }
  if (type === "dateOnly") return <>{formatDateTimeText(value, true)}</>;
  if (["double", "float", "integer", "bigInt"].includes(type ?? "")) {
    return <>{numberText(value)}</>;
  }
  if (type === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (type && ASSOCIATION_TYPES.has(type)) {
    if (Array.isArray(value)) {
      return (
        <>
          {value.length
            ? value.map((item, index) => (
                <span key={index} className="me-1.5">
                  {assocTitle(item)}
                </span>
              ))
            : "-"}
        </>
      );
    }
    return <>{assocTitle(value)}</>;
  }
  if (typeof value === "object") return <>{JSON.stringify(value)}</>;
  return <>{String(value)}</>;
}

// ----------------------------------------------------------- D#22/#23 子表展示

/**
 * details 模式子表只读表（PatternDisplaySubTableFieldModel.getBaseColumns :434-442
 * 的 portal 等价：目标集合前 5 个业务字段为列）。批3 沿用 detail-cards AssocTable 语义
 * ——列来源 collections:get(target)，无快照行时不渲染。
 */
function DisplaySubTable({
  field,
  rows,
}: {
  field: ApprovalCollectionField;
  rows: Record<string, unknown>[];
}) {
  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const target = field.target ?? undefined;
  useEffect(() => {
    if (!target) return;
    let alive = true;
    getCollectionMeta(target)
      .then((response) => {
        if (alive) setMeta(response.data ?? null);
      })
      .catch(() => {
        if (alive) setMeta(null);
      });
    return () => {
      alive = false;
    };
  }, [target]);
  const columns = (meta?.fields ?? [])
    .filter((item) => !SYSTEM_FIELDS.has(String(item.name)) && item.type !== "virtual")
    .slice(0, 5);
  if (!columns.length) {
    return <span className="text-sm text-muted-foreground">{rows.length} rows</span>;
  }
  return (
    <div className="overflow-hidden rounded-md border">
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
          {(Array.isArray(rows) ? rows : []).map((row, rowIndex) => (
            <TableRow key={String(row?.id ?? rowIndex)}>
              {columns.map((column) => (
                <TableCell key={String(column.name)}>
                  <DisplayValue field={column} value={row?.[String(column.name)]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------- 编辑控件

const enumOptions = (field: ApprovalCollectionField | undefined) =>
  (field?.uiSchema?.enum ?? [])
    .filter(
      (option): option is { label: unknown; value: unknown } =>
        typeof option === "object" && option !== null
    )
    .map((option) => ({
      label: String(option.label ?? option.value),
      value: String(option.value),
    }));

function DateEditor({
  id,
  withTime,
  value,
  disabled,
  onChange,
}: {
  id: string;
  withTime: boolean;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(() =>
    typeof value === "string" && withTime && dayjs(value).isValid()
      ? dayjs(value).format("HH:mm")
      : "00:00"
  );
  const parsed = useMemo(
    () => (typeof value === "string" && value ? dayjs(value) : undefined),
    [value]
  );
  const datePart =
    parsed && parsed.isValid() ? parsed.format("YYYY-MM-DD") : undefined;

  const emit = (nextDate?: string, nextTime?: string) => {
    if (!nextDate) {
      onChange(undefined);
      return;
    }
    const day = dayjs(nextDate, "YYYY-MM-DD");
    if (!withTime) {
      onChange(day.format("YYYY-MM-DD"));
      return;
    }
    const [hours, minutes] = (nextTime ?? "00:00").split(":");
    onChange(
      day
        .hour(Number(hours) || 0)
        .minute(Number(minutes) || 0)
        .second(0)
        .toISOString()
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="outline"
              disabled={disabled}
              className="min-w-0 flex-1 justify-start font-normal"
            >
              {datePart
                ? withTime
                  ? `${datePart} ${time}`
                  : datePart
                : translate("approval.filter.pickDate", { ns: "app" }, "Pick a date")}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={datePart ? dayjs(datePart).toDate() : undefined}
            onSelect={(selected) => {
              if (!selected) return;
              emit(dayjs(selected).format("YYYY-MM-DD"), time);
              if (!withTime) setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {withTime ? (
        <Input
          type="time"
          className="w-28 shrink-0"
          disabled={disabled}
          value={time}
          onChange={(event) => {
            const next = event.target.value;
            setTime(next);
            if (datePart) emit(datePart, next);
          }}
          aria-label={translate("approval.apply.time", { ns: "app" }, "Time")}
        />
      ) : null}
    </div>
  );
}

function MultiEnumEditor({
  id,
  options,
  value,
  disabled,
  onChange,
}: {
  id: string;
  options: Array<{ label: string; value: string }>;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const selected: string[] = Array.isArray(value)
    ? value.map(String)
    : value != null
      ? [String(value)]
      : [];
  return (
    <div id={id} className="flex flex-col gap-1.5" role="group">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={`flex items-center gap-2 text-sm ${disabled ? "opacity-60" : "cursor-pointer"}`}
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) => {
                const nextSelected = next
                  ? [...selected, option.value]
                  : selected.filter((item) => item !== option.value);
                onChange(nextSelected.length ? nextSelected : undefined);
              }}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

/**
 * 单字段编辑器（批1 FieldEditor 升级）：uiSchema['x-component'] 语义优先
 * （Radio.Group → RadioGroup，多选 mode → checkbox 组），interface 兜底分派；
 * 批5c 加 faceOverride（设计器 fieldSettings.init.xComponent 覆盖，form-fields
 * effectiveFieldFace 计算，undefined/未知回落元数据推断）。
 */
function FieldEditor({
  id,
  field,
  value,
  disabled,
  faceOverride,
  onChange,
}: {
  id: string;
  field: ApprovalCollectionField | undefined;
  value: unknown;
  disabled?: boolean;
  faceOverride?: string;
  onChange: (value: unknown) => void;
}) {
  const face = faceOverride ?? field?.interface ?? "";
  const type = field?.type ?? "";
  const ui = field?.uiSchema ?? {};
  const component = String(ui["x-component"] ?? "");
  const componentProps = ui["x-component-props"] ?? {};

  if (DATE_INTERFACES.has(face)) {
    return (
      <DateEditor
        id={id}
        withTime={face !== "dateOnly"}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  if (SELECT_INTERFACES.has(face) || face === "selectMultiple") {
    const options = enumOptions(field);
    const multiple =
      face === "selectMultiple" ||
      componentProps.mode === "multiple" ||
      Array.isArray(value);
    if (multiple) {
      return (
        <MultiEnumEditor
          id={id}
          options={options}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      );
    }
    if (component === "Radio.Group") {
      return (
        <div id={id} className="flex flex-row flex-wrap gap-4" role="radiogroup">
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                className="accent-primary"
                disabled={disabled}
                checked={String(value ?? "") === option.value}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }
    return (
      <Select
        value={value === undefined || value === null ? null : String(value)}
        onValueChange={(next) => onChange(next ?? undefined)}
        items={options}
      >
        <SelectTrigger id={id} className="w-full" disabled={disabled}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (BOOLEAN_INTERFACES.has(face) || type === "boolean") {
    return (
      <Switch
        id={id}
        disabled={disabled}
        checked={Boolean(value)}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }
  if (TEXTAREA_INTERFACES.has(face)) {
    const autoSize = (componentProps.autoSize ?? {}) as {
      minRows?: number;
      maxRows?: number;
    };
    return (
      <Textarea
        id={id}
        disabled={disabled}
        rows={autoSize.minRows ?? 3}
        value={typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (NUMBER_INTERFACES.has(face)) {
    return (
      <Input
        id={id}
        type="number"
        disabled={disabled}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
      />
    );
  }
  // 关联字段（D#17 edit 侧）：portal 无 RecordPicker，ID 直填 + target 提示（登记差异）
  if (type && ASSOCIATION_TYPES.has(type)) {
    const isSingle = type === "belongsTo" || type === "hasOne" || type === "m2o" || type === "o2o";
    const current = isSingle
      ? value == null || typeof value !== "object"
        ? value
        : (value as Record<string, unknown>).id
      : undefined;
    return (
      <Input
        id={id}
        disabled={disabled}
        value={current == null ? "" : String(current)}
        placeholder={field?.target ? `ID (${field.target})` : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? undefined : /^\d+$/.test(raw) ? Number(raw) : raw);
        }}
      />
    );
  }
  return (
    <Input
      id={id}
      type={face === "email" ? "email" : face === "password" ? "password" : "text"}
      disabled={disabled}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
    />
  );
}

// ------------------------------------------------------------- 顶层渲染器

export interface FormFieldsRendererProps {
  fields: FormFieldSpec[];
  resolveField: FieldMetaResolver;
  values: Record<string, unknown>;
  errors?: Record<string, string>;
  /** D#5 pattern==='details' → 只读渲染（Display 族切换）。 */
  readOnly?: boolean;
  disabled?: boolean;
  idPrefix?: string;
  onChange?: (fieldPath: string, value: unknown) => void;
}

export function FormFieldsRenderer({
  fields,
  resolveField,
  values,
  errors = {},
  readOnly = false,
  disabled = false,
  idPrefix = "approval-form",
  onChange,
}: FormFieldsRendererProps) {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => {
        const meta = resolveField(field);
        const label = field.label ?? meta?.uiSchema?.title ?? field.fieldPath;
        const required = !readOnly && isFieldRequired(field, meta);
        const value = values[field.fieldPath];
        const id = `${idPrefix}-${field.uid}`;
        const isSubTable =
          !readOnly &&
          !!meta?.type &&
          (meta.type === "hasMany" || meta.type === "belongsToMany" || meta.type === "o2m" || meta.type === "m2m") &&
          Array.isArray(value);
        const errorText = errors[field.fieldPath]
          ? translate("approval.apply.fieldRequired", { ns: "app" }, "{label} is required.").replace(
              "{label}",
              String(label)
            )
          : undefined;
        return (
          <div key={field.uid} className="min-w-0 space-y-1.5">
            {field.showLabel !== false ? (
              <Label htmlFor={id} className="text-sm">
                {label}
                {required ? <span className="ms-0.5 text-red-500">*</span> : null}
              </Label>
            ) : null}
            {readOnly ? (
              meta?.type === "hasMany" || meta?.type === "belongsToMany" || meta?.type === "o2m" || meta?.type === "m2m" ? (
                Array.isArray(value) && value.length ? (
                  <DisplaySubTable field={meta} rows={value as Record<string, unknown>[]} />
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )
              ) : (
                <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
                  <DisplayValue field={meta} value={value} />
                </div>
              )
            ) : isSubTable ? (
              // 批3 登记差异：子表编辑列 portal 未复刻，快照行只读展示
              <DisplaySubTable field={meta as ApprovalCollectionField} rows={value as Record<string, unknown>[]} />
            ) : (
              <FieldEditor
                id={id}
                field={meta}
                value={value}
                disabled={disabled}
                faceOverride={field.xComponent ? effectiveFieldFace(field, meta) : undefined}
                onChange={(next) => onChange?.(field.fieldPath, next)}
              />
            )}
            {errorText ? <p className="text-xs text-red-600">{errorText}</p> : null}
          </div>
        );
      })}
      {!fields.length ? (
        <p className="text-sm text-muted-foreground">
          {translate("approval.list.noData", { ns: "app" }, "No data yet")}
        </p>
      ) : null}
    </div>
  );
}
