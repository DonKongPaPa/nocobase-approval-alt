/**
 * Approval (node) interface-builder page models — ported 1:1 from official
 * chunks 143 (module 3562) and 427 (modules 5294 + 9738).
 *
 * ApprovalChildPageModel     extends ChildPageModel    (+ ApprovalChildPageSettings flow)
 * ApprovalChildPageTabModel  extends ChildPageTabModel
 * ApprovalBlockGridModel     extends BlockGridModel    — "Add block" menu with
 *                              Triggers / Node result / Data / Other groups
 *
 * client-v2 lane 定位：v3 settings 壳 workflow 配置面适配层。Add-block 菜单的
 * 「Process form」组（ProcessFormModel + PatternFormGridModel，审批处理表单 UI）
 * 与 processFormModelOptions 工厂已剥离——由 v3 portal 扩展承载；保留触发器/
 * 节点结果数据区块与其他区块。
 */
const React = require('react');
const { PlusOutlined } = require('@ant-design/icons');
const { useRequest } = require('ahooks');
const clientV2 = require('@nocobase/client-v2');
const flowEngine = require('@nocobase/flow-engine');
const workflowClient = require('@nocobase/plugin-workflow/client-v2');
const { compact, groupHasChildren } = require('./shared');

function gridOptions(parentId) {
  return { parentId, subKey: 'grid', async: true, subType: 'object', use: 'ApprovalBlockGridModel' };
}

/** Remove stale/mismatched grid models before (re)creating (chunk 143 cleanup). */
function removeStaleGridModel(engine, options) {
  const { parentId, subKey } = options;
  if (typeof parentId !== 'string' || typeof subKey !== 'string') return;
  const existing = engine.findModelByParentId?.(parentId, subKey);
  if (!existing) return;
  const className = existing?.constructor?.name;
  const useName = typeof existing?.use === 'string' ? existing.use : existing?.use?.name;
  if (className === 'ErrorFlowModel' || useName !== 'ApprovalBlockGridModel') {
    engine.removeModelWithSubModels(existing.uid);
  }
}

/** Loader component (chunk 143 `m`). */
export function ApprovalGridLoader({ ctx, options }) {
  const engine = flowEngine.useFlowEngine();
  const request = useRequest(
    async () => {
      const { ensureApprovalModelLoaders } = require('./registerModelLoaders');
      ensureApprovalModelLoaders(engine);
      await engine.preloadModelLoaders();
      await engine.getModelClassAsync?.('ApprovalBlockGridModel');
      removeStaleGridModel(engine, options);
      const model = await engine.loadOrCreateModel(options, { skipSave: false });
      if (model?.parent?.uid !== ctx.model.uid) {
        model?.context.addDelegate(ctx);
      }
      return model;
    },
    { refreshDeps: [ctx.model.uid, engine] },
  );
  const data = request.data;
  const margin = ctx?.isMobileLayout ? 8 : ctx?.themeToken?.marginBlock;
  if (!request.loading && data?.uid) {
    return <flowEngine.FlowModelRenderer model={data} fallback={<clientV2.SkeletonFallback style={{ margin }} />} />;
  }
  return <clientV2.SkeletonFallback style={{ margin }} />;
}

export class ApprovalChildPageModel extends clientV2.ChildPageModel {
  onInit(options) {
    super.onInit(options);
    this.context.defineProperty('disableFieldClickToOpen', { get: () => true });
  }

  setCollectionCtx({ dataSourceKey, collectionName }) {
    this.context.defineProperty('collection', {
      get: () => this.context.dataSourceManager.getCollection(dataSourceKey, collectionName),
      cache: false,
    });
  }

  renderFirstTab() {
    const tab = this.getFirstTab();
    if (!tab?.uid) return null;
    return <ApprovalGridLoader ctx={tab.context} options={gridOptions(tab.uid)} />;
  }
}

ApprovalChildPageModel.registerFlow({
  key: 'ApprovalChildPageSettings',
  steps: {
    init: {
      handler: (ctx, params) => {
        ctx.model.setCollectionCtx(params);
      },
    },
  },
});

export class ApprovalChildPageTabModel extends clientV2.ChildPageTabModel {
  renderChildren() {
    return <ApprovalGridLoader ctx={this.context} options={gridOptions(this.uid)} />;
  }
}

/** "Add block" menu component (chunk 427 `v`). */
function AddBlockMenu({ model }) {
  const plugin = clientV2.usePlugin(workflowClient.PluginWorkflowClientV2);
  const inputArgs = model.context.view?.inputArgs ?? {};
  const workflow = inputArgs.flowContext?.workflow;
  const availableUpstreams = inputArgs.availableUpstreams;
  const upstreams = React.useMemo(() => availableUpstreams || [], [availableUpstreams]);
  const items = React.useMemo(() => {
    // lane 剥离：「Approval blocks / Process form」组（ProcessFormModel +
    // PatternFormGridModel，审批处理表单 UI）不进本 lane，由 v3 portal 扩展承载
    const dataChildren = [];
    const triggerItems = compact(
      plugin.getTriggerOptions?.(workflow?.type)?.getCreateModelMenuItem?.({
        config: workflow?.config ?? {},
        workflow,
      }),
    );
    if (triggerItems.length) {
      dataChildren.push({ key: 'triggers', label: '{{t("Triggers", { ns: "workflow" })}}', children: triggerItems });
    }
    const nodeItems = upstreams.flatMap((node) =>
      compact(plugin.getInstruction?.(node.type)?.getCreateModelMenuItem?.({ node, workflow })),
    );
    if (nodeItems.length) {
      dataChildren.push({ key: 'nodes', label: '{{t("Node result", { ns: "workflow" })}}', children: nodeItems });
    }
    return [
      { key: 'dataBlocks', type: 'group', label: '{{t("Data blocks")}}', children: dataChildren },
      {
        key: 'otherBlocks',
        type: 'group',
        label: '{{t("Other blocks")}}',
        children: [
          { key: 'markdown', label: '{{t("Markdown")}}', useModel: 'MarkdownBlockModel', createModelOptions: { use: 'MarkdownBlockModel' } },
          { key: 'jsBlock', label: '{{t("JS block")}}', useModel: 'JSBlockModel', createModelOptions: { use: 'JSBlockModel' } },
        ],
      },
    ].filter(groupHasChildren);
  }, [upstreams, workflow, plugin]);
  return (
    <flowEngine.AddSubModelButton model={model} subModelKey="items" items={items}>
      <flowEngine.FlowSettingsButton icon={<PlusOutlined />}>{model.context.t('Add block')}</flowEngine.FlowSettingsButton>
    </flowEngine.AddSubModelButton>
  );
}

export class ApprovalBlockGridModel extends clientV2.BlockGridModel {
  renderAddSubModelButton() {
    if (!this.context.flowSettingsEnabled) return null;
    return <AddBlockMenu model={this} />;
  }
}

ApprovalBlockGridModel.define({ hide: true });

export default ApprovalChildPageModel;
