/**
 * Interface config dialogs — ported 1:1 from official chunk 483 (modules: the
 * trigger-side config button `A`, dialog content `I`, model factories `N`/`b`)
 * and chunk 617 (node-side content `P` and button `M`).
 *
 * client-v2 lane 定位：v3 settings 壳 workflow 配置面适配层。本文件只保留发起/
 * 审批「页面模型」配置面（TriggerChildPageModel / ApprovalChildPageModel 树）；
 * 任务卡/表单 UI（ApplyTaskCard* / ApprovalTaskCard* / PatternForm* 模型族，
 * 审批中心由 v3 portal 扩展承载）相关工厂与分支已剥离：
 *   - applyTaskCardModelOptions / configureApplyTaskCardContext：删
 *   - nodeConfigModelOptions 仅剩 approval 分支；NodeModelConfigContent 的
 *     kind==='taskCard' 分支删
 *   - ensureApprovalModelLoaders 指向 models/registerModelLoaders.js 子集
 *     （仅 TriggerChildPage / ApprovalChildPage 两族共六模型）
 *
 * Trigger side:  config.approvalUid (TriggerChildPageModel tree, prefix approval_)
 *                legacy config.applyForm (v1 uiSchema) migration
 * Node side:     config.applyDetail (ApprovalChildPageModel)
 */
const React = require('react');
const { SettingOutlined, CreditCardOutlined, DownOutlined } = require('@ant-design/icons');
const { useRequest, useMemoizedFn } = require('ahooks');
const antd = require('antd');
const clientV2 = require('@nocobase/client-v2');
const flowEngine = require('@nocobase/flow-engine');
const workflowClient = require('@nocobase/plugin-workflow/client-v2');
const { useAPIClient } = clientV2;
const {
  NS,
  MZ,
  splitCollectionName,
  rootDataSourceManager,
} = require('./shared');
const { ensureApprovalModelLoaders } = require('./registerModelLoaders');

/** Official q.k: register the approval client-side collections (module 334). */
const ensuredEngines = new WeakSet();
export function ensureApprovalCollections(flowEngine) {
  if (!flowEngine || ensuredEngines.has(flowEngine)) return;
  ensuredEngines.add(flowEngine);
  try {
    require('./registerCollections').registerApprovalCollections(flowEngine);
  } catch (e) {
    console.error('registerApprovalCollections failed:', e);
  }
}

function viewerDialog(flowCtx, options) {
  // flow context viewer API: official `k.viewer.dialog({...})`
  if (typeof flowCtx?.viewer?.dialog === 'function') {
    flowCtx.viewer.dialog(options);
    return;
  }
  // fallback for contexts without the viewer channel
  const ModalForm = () => options.content();
  antd.Modal.info({
    width: options.width ?? 800,
    title: options.title,
    content: React.createElement(ModalForm),
    okText: flowCtx?.t?.('OK') ?? 'OK',
  });
}

/**
 * Dialog content component (chunk 483 `I`): load-or-create the configured model,
 * recreate with a fresh uid when the stored descriptor mismatches, wire context
 * delegates, then render FlowModelRenderer.
 */
export function ModelConfigContent({
  configureModel,
  createModelOptions,
  deferValueChangeUntilReady,
  disabled,
  onChange,
  onModelReady,
  uid: modelUid,
  uidPrefix,
  waitFor,
}) {
  const engine = flowEngine.useFlowEngine();
  const viewCtx = flowEngine.useFlowViewContext();
  const readOnly = disabled;
  const request = useRequest(async () => {
    ensureApprovalModelLoaders(engine);
    ensureApprovalCollections(engine);
    await engine.preloadModelLoaders?.();
    if (uidPrefix?.startsWith('approval_')) {
      await engine.getModelClassAsync?.('UploadFieldModel');
    }
    // load or recreate (chunk 483 inner helper)
    const create = (id) => (readOnly ? engine.loadOrCreateModel(createModelOptions(id), { skipSave: true }) : engine.loadOrCreateModel(createModelOptions(id)));
    const expectedUse = typeof createModelOptions(modelUid).use === 'string' ? createModelOptions(modelUid).use : createModelOptions(modelUid).use?.name;
    let model = await create(modelUid);
    if (!model?.uid || !expectedUse || model.use === expectedUse) {
      // keep
    } else {
      if (!readOnly) engine.removeModelWithSubModels(model.uid);
      const freshUid = flowEngine.randomId(uidPrefix);
      if (!readOnly) onChange?.(freshUid);
      model = await create(freshUid);
    }
    if (!model) return null;
    if (Array.isArray(waitFor) && waitFor.length) {
      await Promise.all(waitFor.map((name) => engine.getModelClassAsync?.(name)));
    }
    model.context.addDelegate(viewCtx);
    model.context.defineProperty('view', { get: () => viewCtx.view, cache: false });
    model.context.defineProperty('dataSourceManager', { value: rootDataSourceManager(engine) });
    model.context.defineProperty('flowSettingsEnabled', { get: () => !readOnly, cache: false });
    model.context.defineProperty('disableFieldClickToOpen', { get: () => true, cache: false });
    configureModel?.(model);
    if (model.uid) onModelReady?.(model.uid);
    return model;
  }, { refreshDeps: [modelUid, readOnly] });
  const model = request.data;
  if (!request.loading && model?.uid) {
    return <flowEngine.FlowModelRenderer model={model} hideRemoveInSettings showFlowSettings={false} />;
  }
  return <antd.Spin style={{ display: 'block', margin: 24 }} />;
}

/** Hidden input keeping a boolean form value (chunk 483 V). */
function HiddenBooleanInput({ value }) {
  return <input type="hidden" value={String(value !== undefined)} readOnly />;
}

/** Collection display text (chunk 483 _). */
export function CollectionDisplay({ value }) {
  const engine = flowEngine.useFlowEngine();
  const [ds, name] = workflowClient.parseCollectionName(value);
  const dataSource = engine.context.dataSourceManager?.getDataSource?.(ds);
  const collection =
    dataSource?.collectionManager?.getCollection?.(name) ??
    dataSource?.getCollection?.(name) ??
    engine.context.dataSourceManager?.getCollection?.(ds, name);
  const text = [
    dataSource?.displayName ?? dataSource?.options?.displayName ?? dataSource?.options?.title ?? ds,
    collection?.title ?? collection?.options?.title ?? collection?.name ?? name,
  ]
    .filter(Boolean)
    .join(' / ');
  return <antd.Typography.Text>{text}</antd.Typography.Text>;
}

/** Trigger initiator-interface model factory (chunk 483 N). */
export function triggerPageModelOptions(uid) {
  return {
    async: true,
    uid,
    subType: 'object',
    use: 'TriggerChildPageModel',
    props: {
      displayTitle: false,
      enableTabs: false,
      title: `{{t("Initiator's interface", { ns: "${NS}" })}}`,
    },
    subModels: {
      tabs: [
        {
          use: 'TriggerChildPageTabModel',
          subModels: { grid: { use: 'TriggerBlockGridModel' } },
          stepParams: { pageTabSettings: { tab: { title: '{{t("Details")}}' } } },
        },
      ],
    },
    stepParams: {
      pageSettings: {
        general: {
          displayTitle: false,
          enableTabs: false,
          title: `{{t("Initiator's interface", { ns: "${NS}" })}}`,
        },
      },
    },
  };
}

// lane 剥离：applyTaskCardModelOptions / configureApplyTaskCardContext（chunk 483
// b/v，「我的申请卡片」ApplyTaskCardDetailsModel 树）不进本 lane——任务卡 UI 由
// v3 portal 扩展承载。

function useMemoizedFnFactory(fn) {
  const ref = React.useRef(fn);
  ref.current = fn;
  return React.useCallback((...args) => ref.current(...args), []);
}

/** Empty grid / tab factories (chunk 617 O / x). */
export function emptyApprovalGridOptions() {
  return { async: true, subType: 'object', use: 'ApprovalBlockGridModel', subModels: { items: [] } };
}

export function approvalTabOptions() {
  return {
    use: 'ApprovalChildPageTabModel',
    stepParams: { pageTabSettings: { tab: { title: '{{t("Details")}}' } } },
    subModels: { grid: emptyApprovalGridOptions() },
  };
}

/** Node-side model factory (chunk 617 `D`). */
export function nodeConfigModelOptions(kind, uid, workflow) {
  if (kind === 'approval') {
    const [ds, name] = splitCollectionName(workflow?.config?.collection);
    return {
      async: true,
      subType: 'object',
      uid,
      use: 'ApprovalChildPageModel',
      props: {
        displayTitle: false,
        enableTabs: false,
        title: `{{t("Approver's interface", { ns: "${NS}" })}}`,
      },
      subModels: { tabs: [{ ...approvalTabOptions() }] },
      stepParams: {
        pageSettings: {
          general: {
            displayTitle: false,
            enableTabs: false,
            title: `{{t("Approver's interface", { ns: "${NS}" })}}`,
          },
        },
        ApprovalChildPageSettings: {
          init: { dataSourceKey: ds, collectionName: name },
        },
      },
    };
  }
  // lane 剥离：taskCard 分支（ApprovalTaskCardDetailsModel 树，「我的审批卡片」）
  // 不进本 lane——审批任务卡 UI 由 v3 portal 扩展承载；本 lane 只服务 approval
  // （审批人操作界面 ApprovalChildPageModel 树）配置面。
  return undefined;
}

/**
 * Node-side dialog content (chunk 617 P): tabs/grid repair + collection sync +
 * inputArgs context for the interface builder.
 */
export function NodeModelConfigContent({
  deferValueChangeUntilReady,
  disabled,
  kind,
  node,
  nodeConfig,
  onNodeConfigChange,
  nodes,
  onChange,
  onModelReady,
  uid: modelUid,
  uidPrefix,
  upstreams,
  workflowVariableOptions,
  workflow,
}) {
  const engine = flowEngine.useFlowEngine();
  const viewCtx = flowEngine.useFlowViewContext();
  const readOnly = disabled;
  const request = useRequest(async () => {
    ensureApprovalModelLoaders(engine);
    ensureApprovalCollections(engine);
    await engine.preloadModelLoaders?.();
    const createOptions = (uid) => nodeConfigModelOptions(kind, uid, workflow);
    const create = (id) => (readOnly ? engine.loadOrCreateModel(createOptions(id), { skipSave: true }) : engine.loadOrCreateModel(createOptions(id)));
    const descriptor = createOptions(modelUid);
    const expectedUse = typeof descriptor.use === 'string' ? descriptor.use : descriptor.use?.name;
    let model = await create(modelUid);
    if (!model?.uid || !expectedUse || model.use !== expectedUse) {
      if (!readOnly) engine.removeModelWithSubModels(model.uid);
      const freshUid = flowEngine.randomId(uidPrefix);
      if (!readOnly) onChange?.(freshUid);
      model = await create(freshUid);
    }
    if (!model) return null;
    if (kind === 'approval' && !readOnly) {
      // ensure tabs[0] + its grid model exist (chunk 617 repair logic)
      let changed = false;
      let tab = model.subModels?.tabs?.[0];
      if (!tab?.uid && model.addSubModel) {
        tab = model.addSubModel('tabs', approvalTabOptions());
        changed = true;
      }
      if (tab?.uid) {
        let grid = tab.subModels?.grid;
        if (!grid) {
          grid = engine.findModelByParentId?.(tab.uid, 'grid');
          if (grid) {
            tab.subModels = tab.subModels ?? {};
            tab.subModels.grid = grid;
          } else {
            grid = await engine.loadModel?.({ parentId: tab.uid, subKey: 'grid' });
            if (grid) {
              tab.subModels = tab.subModels ?? {};
              tab.subModels.grid = grid;
            }
          }
        }
        if (tab.uid && !grid && tab.setSubModel) {
          tab.setSubModel('grid', emptyApprovalGridOptions());
          changed = true;
        }
      }
      // sync ApprovalChildPageSettings when the trigger collection changed
      const [ds, name] = splitCollectionName(workflow?.config?.collection);
      const init = model.getStepParams?.('ApprovalChildPageSettings', 'init') ?? {};
      if (init.dataSourceKey !== ds || init.collectionName !== name) {
        model.setStepParams?.('ApprovalChildPageSettings', 'init', { dataSourceKey: ds, collectionName: name });
        model.setCollectionCtx?.({ dataSourceKey: ds, collectionName: name });
        await model.save?.();
      }
      if (changed) {
        await model.save?.();
      }
    }
    model.context.defineProperty('dataSourceManager', { value: rootDataSourceManager(engine) });
    model.context.defineProperty('flowSettingsEnabled', { get: () => !readOnly, cache: false });
    model.context.defineProperty('disableFieldClickToOpen', { get: () => true, cache: false });
    model.context.defineProperty('view', {
      value: {
        inputArgs: {
          isWorkflowFormConfigMode: true,
          flowContext: { workflow, nodes: nodes?.length ? nodes : [node] },
          approval: { collectionName: workflow?.config?.collection },
          availableUpstreams: upstreams ?? [],
          node,
          nodeConfig: nodeConfig ?? node?.config ?? {},
          onNodeConfigChange,
          workflowVariableOptions,
        },
      },
    });
    // lane 剥离：kind==='taskCard' 分支（ApprovalTaskCard* 模型等待 + collection
    // 注入）不进本 lane——审批任务卡 UI 由 v3 portal 扩展承载。
    if (model.uid) onModelReady?.(model.uid);
    return model;
  }, {
    refreshDeps: [
      modelUid,
      readOnly,
      kind,
      workflow?.config?.collection,
      node?.key,
      nodes?.length,
      upstreams?.length,
    ],
  });
  const model = request.data;
  if (!request.loading && model?.uid) {
    return (
      <flowEngine.FlowModelRenderer
        model={model}
        hideRemoveInSettings
        showFlowSettings={false}
      />
    );
  }
  return <antd.Spin style={{ display: 'block', margin: 24 }} />;
}

/**
 * Trigger-side interface config button (chunk 483 A): uid field + 配置 button +
 * viewer dialog; supports the legacy v1 uiSchema (`config.applyForm`) migration.
 */
export function InterfaceConfigButton({
  buttonIcon = React.createElement(SettingOutlined),
  buttonType,
  configureModel,
  createModelOptions,
  deferValueChangeUntilReady,
  disabled,
  hideUid = false,
  onChange,
  title,
  uidPrefix,
  value,
  legacyFieldName = 'applyForm',
  legacyResource = 'workflows',
  waitFor,
}) {
  const flowCtx = flowEngine.useFlowContext();
  const t = useFlowTranslator();
  const { token } = antd.theme.useToken();
  const form = antd.Form.useFormInstance();
  const currentWorkflow = workflowClient.useCurrentWorkflowContext();
  const nodeFlowCtx = workflowClient.useFlowContext();
  const configRef = React.useRef({
    config: { ...(currentWorkflow?.config ?? {}) },
    workflowId: currentWorkflow?.id,
  });
  if (configRef.current.workflowId !== currentWorkflow?.id) {
    configRef.current = { config: { ...(currentWorkflow?.config ?? {}) }, workflowId: currentWorkflow?.id };
  }
  const legacyUid = antd.Form.useWatch(['config', legacyFieldName], form);
  const storedLegacy = uidPrefix?.startsWith('approval_')
    ? legacyUid ?? form.getFieldValue(['config', legacyFieldName])
    : undefined;
  const executed = Number(currentWorkflow?.versionStats?.executed ?? 0) > 0;
  const locked = executed || !!disabled;
  const editDisabled = executed ? !!disabled : disabled;

  const openDialog = useMemoizedFn(() => {
    const deferForLegacy = !locked && !!storedLegacy;
    const uid = value ?? flowEngine.randomId(uidPrefix);
    if (!value && !deferForLegacy && !locked) onChange?.(uid);
    const isTaskCard = uidPrefix?.startsWith('task_card');
    const inputArgs = {
      flowContext: { workflow: currentWorkflow },
      isWorkflowFormConfigMode: true,
      nodeConfig: { ...configRef.current.config },
    };
    if (!locked && uidPrefix?.startsWith('approval_') && currentWorkflow?.id != null) {
      inputArgs.onNodeConfigChange = async (nextConfig) => {
        const prevConfig = { ...form.getFieldValue(['config']) };
        const withdrawable = nextConfig.withdrawable === true;
        form.setFieldsValue({ config: { ...prevConfig, withdrawable } });
        try {
          await flowCtx.api.resource('workflows').update({
            filterByTk: currentWorkflow.id,
            values: { config: nextConfig },
          });
        } catch (e) {
          form.setFields([{ name: ['config', 'withdrawable'], value: prevConfig.withdrawable }]);
          throw e;
        }
        configRef.current.config = { ...nextConfig };
        inputArgs.nodeConfig = { ...nextConfig };
        currentWorkflow.config = { ...nextConfig };
      };
    }
    viewerDialog(flowCtx, {
      width: 800,
      closable: true,
      title,
      inputArgs,
      ...(isTaskCard
        ? {}
        : {
            styles: {
              body: { display: 'flow-root', padding: 0, backgroundColor: 'var(--nb-box-bg)' },
              content: { padding: 0 },
              header: {
                marginBottom: 0,
                padding: `${token.padding}px ${token.paddingLG}px`,
              },
            },
          }),
      content: () =>
        React.createElement(ModelConfigContent, {
          configureModel,
          createModelOptions,
          deferValueChangeUntilReady: deferForLegacy,
          disabled: locked,
          onChange: locked ? undefined : onChange,
          onModelReady: deferForLegacy
            ? (modelUid) => {
                onChange?.(modelUid);
                form.setFieldValue(['config', legacyFieldName], undefined);
              }
            : undefined,
          uid,
          uidPrefix,
          waitFor,
        }),
    });
  });

  const deleteLegacy = useMemoizedFn(async () => {
    if (!storedLegacy || currentWorkflow?.id == null) return false;
    await flowCtx.api.request({ method: 'POST', url: `uiSchemas:remove/${storedLegacy}` });
    const config = { ...(form.getFieldValue(['config']) ?? {}), [legacyFieldName]: null };
    form.setFieldValue(['config', legacyFieldName], null);
    await flowCtx.api.resource(legacyResource).update({ filterByTk: currentWorkflow.id, values: { config } });
    configRef.current.config = { ...config };
    currentWorkflow.config = { ...config };
    nodeFlowCtx?.refresh?.();
    flowCtx.message?.success?.(t('Deleted successfully'));
    return true;
  });

  const confirmMigrate = useMemoizedFn(() => {
    antd.Modal.confirm({
      title: t('Configure new interface'),
      content: t('This action will delete the current legacy interface and cannot be undone. Confirm and continue configuring the new interface?'),
      okText: t('Delete and configure new interface'),
      onOk: async () => {
        if (!(await deleteLegacy())) return;
        openDialog();
      },
    });
  });

  if (storedLegacy && executed && value) {
    return React.createElement(
      antd.Space,
      null,
      hideUid ? null : React.createElement('span', null, value),
      React.createElement(
        antd.Button,
        {
          'aria-label': t('Go to configure'),
          disabled: editDisabled,
          icon: buttonIcon,
          onClick: openDialog,
          type: buttonType,
        },
        t('Go to configure'),
      ),
    );
  }
  if (storedLegacy) {
    const menuItems = [
      { key: 'v1', label: t('Legacy interface'), disabled: true },
      { key: 'v2', label: t('Configure new interface'), disabled: disabled || executed, onClick: confirmMigrate },
    ];
    return React.createElement(
      antd.Space,
      { direction: 'vertical', size: 8, align: 'start' },
      !hideUid && value ? React.createElement('span', null, value) : null,
      executed
        ? null
        : React.createElement(antd.Alert, {
            type: 'warning',
            showIcon: true,
            message: t('Interfaces created in the legacy version are no longer supported in the current version. Reconfigure the interface before use.'),
          }),
      React.createElement(
        antd.Dropdown,
        { menu: { items: menuItems }, trigger: ['hover'] },
        React.createElement(
          antd.Button,
          { 'aria-label': t('Go to configure'), disabled, icon: buttonIcon, type: buttonType },
          t('Go to configure'),
          ' ',
          React.createElement(DownOutlined, { 'aria-hidden': true }),
        ),
      ),
    );
  }
  return React.createElement(
    antd.Space,
    null,
    !hideUid && value ? React.createElement('span', null, value) : null,
    React.createElement(
      antd.Button,
      {
        'aria-label': t('Go to configure'),
        disabled: editDisabled,
        icon: buttonIcon,
        onClick: openDialog,
        type: buttonType,
      },
      t('Go to configure'),
    ),
  );
}

/**
 * Node-side interface config button (chunk 617 M): field `config.applyDetail`
 * with kind approval (Approver's interface) / taskCard (My approvals card).
 */
export function NodeInterfaceConfigButton({ disabled, onChange, prefix = 'fm_', value, hideUid = true }) {
  const flowCtx = flowEngine.useFlowContext();
  const t = useFlowTranslator();
  const { token } = antd.theme.useToken();
  const form = antd.Form.useFormInstance();
  const currentWorkflow = workflowClient.useCurrentWorkflowContext();
  const node = workflowClient.useNodeContext();
  const nodeFlowCtx = workflowClient.useFlowContext();
  const upstreams = workflowClient.useAvailableUpstreams(node);
  const workflowVariableOptions = workflowClient.useWorkflowVariableOptions({ types: [] });
  const legacyUid = antd.Form.useWatch(['config', 'applyDetail'], form);
  const storedLegacy = legacyUid ?? form.getFieldValue(['config', 'applyDetail']);
  const kind = prefix?.startsWith('task_card') ? 'taskCard' : 'approval';
  const dialogTitle = kind === 'approval' ? t("Approver's interface") : t('My approvals card');
  const executed = Number(currentWorkflow?.versionStats?.executed ?? 0) > 0;
  const locked = executed || !!disabled;
  const editDisabled = executed ? !!disabled : disabled;

  const writeNodeConfig = (config) => {
    if (node) node.config = config;
    form.setFieldValue(['config'], config);
  };

  const dialogStyles =
    kind === 'approval'
      ? {
          header: { marginBottom: 0, padding: `${token.padding}px ${token.paddingLG}px` },
          body: { display: 'flow-root', padding: 0, backgroundColor: 'var(--nb-box-bg)' },
          content: { padding: 0 },
        }
      : {
          body: { padding: 0, backgroundColor: 'var(--nb-box-bg)' },
          content: { padding: `${token.paddingMD}px ${token.paddingContentHorizontalLG}px` },
        };

  const openDialog = useMemoizedFn(() => {
    const deferForLegacy = !locked && kind === 'approval' && !!storedLegacy;
    const uid = value ?? flowEngine.randomId(prefix);
    if (!value && !deferForLegacy && !locked) onChange?.(uid);
    const config = form.getFieldValue(['config']) ?? node?.config ?? {};
    viewerDialog(flowCtx, {
      width: 800,
      closable: true,
      title: dialogTitle,
      styles: dialogStyles,
      content: () =>
        React.createElement(NodeModelConfigContent, {
          deferValueChangeUntilReady: deferForLegacy,
          disabled: locked,
          kind,
          node,
          nodeConfig: config,
          onNodeConfigChange: locked ? undefined : writeNodeConfig,
          nodes: nodeFlowCtx?.nodes,
          onChange: locked ? undefined : onChange,
          onModelReady: deferForLegacy
            ? (modelUid) => {
                onChange?.(modelUid);
                form.setFieldValue(['config', 'applyDetail'], undefined);
              }
            : undefined,
          uid,
          uidPrefix: prefix,
          upstreams,
          workflowVariableOptions,
          workflow: currentWorkflow,
        }),
    });
  });

  const deleteLegacy = useMemoizedFn(async () => {
    if (!storedLegacy || node?.id == null) return false;
    await flowCtx.api.request({ method: 'POST', url: `uiSchemas:remove/${storedLegacy}` });
    const config = { ...(form.getFieldValue(['config']) ?? node?.config ?? {}), applyDetail: null };
    form.setFieldValue(['config', 'applyDetail'], null);
    if (node) node.config = config;
    await flowCtx.api.resource('flow_nodes').update({ filterByTk: node.id, values: { config } });
    nodeFlowCtx?.refresh?.();
    flowCtx.message?.success?.(t('Deleted successfully'));
    return true;
  });

  const confirmMigrate = useMemoizedFn(() => {
    antd.Modal.confirm({
      title: t('Configure new interface'),
      content: t('This action will delete the current legacy interface and cannot be undone. Confirm and continue configuring the new interface?'),
      okText: t('Delete and configure new interface'),
      onOk: async () => {
        if (!(await deleteLegacy())) return;
        openDialog();
      },
    });
  });

  const goButton = (extra) =>
    React.createElement(
      antd.Button,
      { 'aria-label': t('Go to configure'), disabled: editDisabled, icon: React.createElement(SettingOutlined), onClick: openDialog, ...extra },
      t('Go to configure'),
    );

  if (storedLegacy && kind === 'approval') {
    return React.createElement(
      antd.Space,
      { direction: 'vertical', size: 8, align: 'start' },
      value ? React.createElement('span', null, value) : null,
      executed
        ? null
        : React.createElement(antd.Alert, {
            type: 'warning',
            showIcon: true,
            message: t('Interfaces created in the legacy version are no longer supported in the current version. Reconfigure the interface before use.'),
          }),
      React.createElement(
        antd.Dropdown,
        {
          menu: {
            items: [
              { key: 'v1', label: t('Legacy interface'), disabled: true },
              { key: 'v2', label: t('Configure new interface'), disabled: disabled || executed, onClick: confirmMigrate },
            ],
          },
          trigger: ['hover'],
        },
        goButton(),
      ),
    );
  }
  return React.createElement(antd.Space, null, hideUid ? null : value ? React.createElement('span', null, value) : null, goButton());
}

function useFlowTranslator() {
  const engine = flowEngine.useFlowEngine();
  return React.useMemo(() => {
    const t = engine?.context?.t;
    return (text, opts) => {
      if (typeof text !== 'string') return text;
      const match = text.match(/^\{\{t\(["'](.+?)["']/);
      const raw = match ? match[1] : text;
      return typeof t === 'function' ? t(raw, { ns: NS, ...(opts ?? {}) }) : raw;
    };
  }, [engine]);
}

export default InterfaceConfigButton;
