/**
 * Assignees-scope editor helpers — extracted 1:1 from git ab0c9db
 * models/patternFormModels.jsx:1612-1804 (chunk 828 te/tn/tt: variable helpers
 * for the assignees scope editor + the FilterDynamicComponent panel).
 *
 * client-v2 lane 定位：v3 settings 壳 workflow 配置面适配层。触发器「谁能发起」
 * 字段集需要这 5 个用户筛选助手；patternForm 模型族本体（PatternForm* /
 * ApplyForm* / ProcessForm* / CommentForm* 模型类）不进本 lane——审批中心/
 * 表单 UI 由 v3 portal 扩展承载。
 */
const React = require('react');
const { uid } = require('@nocobase/utils/client');
const clientV2 = require('@nocobase/client-v2');
const flowEngine = require('@nocobase/flow-engine');
const workflowClient = require('@nocobase/plugin-workflow/client-v2');
const { isObj } = require('./shared');

// variable helpers for assignees scope editor (chunk 828 te/tn/tt) -----------

const VARIABLE_ROOTS = ['$env', '$context', '$system'];

function useWorkflowVariableMeta() {
  const flowCtx = flowEngine.useFlowContext();
  const options = workflowClient.useWorkflowVariableOptions({ types: [] });
  const inputOptions = flowCtx?.view?.inputArgs?.workflowVariableOptions;
  return React.useMemo(() => {
    const byName = new Map((Array.isArray(inputOptions) && inputOptions.length ? inputOptions : options).map((o) => [o.name, o]));
    return VARIABLE_ROOTS.map((name) => byName.get(name)).filter(Boolean);
  }, [options, inputOptions]);
}

function variablePathsFromString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const dollar = trimmed.match(/^\{\{\s*(\$[^}]+?)\s*\}\}$/);
  if (dollar) return dollar[1].split('.').map((s) => s.trim()).filter(Boolean);
  const ctxMatch = trimmed.match(/^\{\{\s*ctx(?:\.(.+?))?\s*\}\}$/);
  if (ctxMatch) {
    const path = ctxMatch[1];
    return path ? path.split('.').map((s) => s.trim()).filter(Boolean) : [];
  }
  return undefined;
}

function variableStringFromPaths(paths) {
  const list = paths ?? [];
  return list.length ? `{{ ctx.${list.join('.')} }}` : undefined;
}

export function AssigneeVariableInput({ onChange, style, value }) {
  const flowCtx = flowEngine.useFlowContext();
  const meta = useWorkflowVariableMeta();
  const t = React.useMemo(() => flowCtx?.t ?? ((text) => text), [flowCtx?.t]);
  const display = React.useMemo(() => {
    if (typeof value !== 'string') return value;
    const paths = variablePathsFromString(value);
    return paths?.length && String(paths[0]).startsWith('$') ? variableStringFromPaths({ paths }) : value;
  }, [value]);
  const handleChange = React.useCallback(
    (next) => {
      const paths = variablePathsFromString(next);
      onChange?.(paths?.length && String(paths[0]).startsWith('$') ? (paths.length ? `{{${paths.join('.')}}}` : undefined) : next);
    },
    [onChange],
  );
  const metaTree = React.useCallback(
    () => [{ name: 'constant', paths: ['constant'], render: () => null, title: t('Constant'), type: 'string' }].concat(meta),
    [t, meta],
  );
  const converters = React.useMemo(
    () => ({
      renderInputComponent: (item) => (item?.paths?.[0] === 'constant' ? null : undefined),
      resolvePathFromValue: (value2) => variablePathsFromString(value2) ?? ['constant'],
      resolveValueFromPath: (item) => (item?.paths?.[0] === 'constant' ? '' : variableStringFromPaths(item)),
    }),
    [],
  );
  return (
    <flowEngine.VariableInput
      value={display}
      onChange={handleChange}
      metaTree={metaTree}
      converters={converters}
      style={{ width: '100%', ...style }}
    />
  );
}

export function defaultFilterGroup() {
  return { logic: '$and', items: [] };
}

export function isFilterGroup(v) {
  return isObj(v) && (v.logic === '$and' || v.logic === '$or') && Array.isArray(v.items);
}

function cloneFilterGroup(group) {
  return isFilterGroup(group)
    ? { logic: group.logic, items: group.items.map((item) => (isFilterGroup(item) ? cloneFilterGroup(item) : { ...item })) }
    : defaultFilterGroup();
}

export function isUserFilterItem(item) {
  return isObj(item) && !Object.prototype.hasOwnProperty.call(item, 'id');
}

export function AssigneesFilterPanel({ collection, initialValue, onChange, style }) {
  // 官方（alpha.10 demo 活体 + 宿主 module 1801）：查询用户面板 = 宿主 FilterDynamicComponent
  // 整套条件组编辑器，变量树为全量 useWorkflowVariableOptions（含 Scope variables/节点数据/
  // Trigger variables/System variables/Variables and secrets + Constant/Null）。此前自拼
  // FilterGroup+e7 三根 meta 会丢「节点数据」——demo 截图铁证 2026-10-14。
  const FilterDynamicComponent = workflowClient?.FilterDynamicComponent;
  if (FilterDynamicComponent) {
    return React.createElement(FilterDynamicComponent, {
      collection: typeof collection === 'string' ? collection : collection?.name ?? 'users',
      value: initialValue,
      onChange,
      style,
    });
  }
  const meta = useWorkflowVariableMeta();
  const observableRef = React.useRef();
  const collectionRef = React.useRef();
  const flowCtx = flowEngine.useFlowContext();
  const engine = flowEngine.useFlowEngine({ throwError: false });
  const modelRef = React.useRef();
  const stateRef = React.useRef(null);
  const flowModel = flowCtx?.model instanceof flowEngine.FlowModel ? flowCtx.model : undefined;
  let model = flowModel || modelRef.current;
  if (!model && engine) {
    modelRef.current = new flowEngine.FlowModel({ uid: `approval-assignees-scope-filter-${uid()}`, flowEngine: engine });
    model = modelRef.current;
  }
  if (model && collection && (collectionRef.current?.model !== model || collectionRef.current?.collection !== collection)) {
    model.context.defineProperty('collection', { value: collection });
    collectionRef.current = { collection, model };
  }
  const valueRef = React.useRef();
  if (!valueRef.current) valueRef.current = flowEngine.observable(cloneFilterGroup(initialValue));
  const group = valueRef.current;
  React.useEffect(() => {
    const serialized = JSON.stringify(cloneFilterGroup(initialValue));
    if (stateRef.current !== serialized) {
      const next = cloneFilterGroup(initialValue);
      if (group) {
        group.logic = next.logic;
        group.items = next.items;
        stateRef.current = serialized;
      }
    }
  }, [initialValue, group]);
  React.useEffect(() => {
    if (!group) return undefined;
    return flowEngine.reaction(
      () => JSON.stringify(flowEngine.toJS(group)),
      (serialized) => {
        const parsed = JSON.parse(serialized);
        stateRef.current = serialized;
        onChange?.(cloneFilterGroup(parsed));
      },
      { fireImmediately: false },
    );
  }, [onChange, group]);
  const renderFilterItem = React.useCallback(
    (props) =>
      model ? (
        <clientV2.VariableFilterItem {...props} model={model} rightAsVariable rightMetaTree={() => meta} />
      ) : null,
    [model, meta],
  );
  if (!collection || !model) return null;
  return (
    <div className="nb-approval-assignees-filter-panel" style={style}>
      <clientV2.FilterGroup value={group} FilterItem={renderFilterItem} />
    </div>
  );
}
