/**
 * Trigger interface-builder page models — ported 1:1 from official chunks 344
 * (module 4907) and 984 (module 9395).
 *
 * TriggerChildPageModel     extends ChildPageModel      (client-v2)
 * TriggerChildPageTabModel  extends ChildPageTabModel   — renders the grid sub-model
 * TriggerBlockGridModel     extends BlockGridModel      — "Add block" menu
 *
 * client-v2 lane 定位：v3 settings 壳 workflow 配置面适配层。Add-block 菜单的
 * 「Apply form」组（ApplyFormModel / PatternFormGridModel / ApplyFormSubmitModel，
 * 审批表单 UI）已剥离——由 v3 portal 扩展承载；仅保留其他区块（Markdown / JS）。
 */
const React = require('react');
const { PlusOutlined } = require('@ant-design/icons');
const { useRequest } = require('ahooks');
const clientV2 = require('@nocobase/client-v2');
const flowEngine = require('@nocobase/flow-engine');
const { MZ } = require('./shared');

/** Loader component (chunk 344 `w`): load-or-create the grid sub-model and render it. */
export function ChildGridLoader({ ctx, options }) {
  const request = useRequest(
    async () => {
      const model = await ctx.engine.loadOrCreateModel(options, { skipSave: !ctx.flowSettingsEnabled });
      model.context.addDelegate(ctx);
      return model;
    },
    { refreshDeps: [ctx.model.uid] },
  );
  const data = request.data;
  const margin = ctx?.isMobileLayout ? 8 : ctx?.themeToken?.marginBlock;
  if (!request.loading && data?.uid) {
    return (
      <flowEngine.FlowModelRenderer
        model={data}
        fallback={<clientV2.SkeletonFallback style={{ margin }} />}
      />
    );
  }
  return <clientV2.SkeletonFallback style={{ margin }} />;
}

export class TriggerChildPageModel extends clientV2.ChildPageModel {
  onInit(options) {
    super.onInit(options);
    this.context.defineProperty('disableFieldClickToOpen', { get: () => true });
  }
}

export class TriggerChildPageTabModel extends clientV2.ChildPageTabModel {
  renderChildren() {
    return (
      <ChildGridLoader
        ctx={this.context}
        options={{
          parentId: this.uid,
          subKey: 'grid',
          async: true,
          subType: 'object',
          use: 'TriggerBlockGridModel',
        }}
      />
    );
  }
}

export class TriggerBlockGridModel extends clientV2.BlockGridModel {
  renderAddSubModelButton() {
    if (!this.context.flowSettingsEnabled) return null;
    const items = [
      // lane 剥离：「Form / Apply form」组（ApplyFormModel + PatternFormGridModel +
      // ApplyFormSubmitModel，审批申请表单 UI）不进本 lane，由 v3 portal 扩展承载
      {
        key: 'otherBlocks',
        type: 'group',
        label: MZ('Other blocks'),
        children: [
          { key: 'markdown', label: MZ('Markdown'), useModel: 'MarkdownBlockModel', createModelOptions: { use: 'MarkdownBlockModel' } },
          { key: 'jsBlock', label: MZ('JS block'), useModel: 'JSBlockModel', createModelOptions: { use: 'JSBlockModel' } },
        ],
      },
    ];
    return (
      <flowEngine.AddSubModelButton model={this} subModelKey="items" items={items}>
        <flowEngine.FlowSettingsButton icon={<PlusOutlined />}>{this.context.t('Add block')}</flowEngine.FlowSettingsButton>
      </flowEngine.AddSubModelButton>
    );
  }
}

TriggerBlockGridModel.define({ hide: true });

export default TriggerChildPageModel;
