/**
 * client-v2 lane of the compatible approval implementation — settings-shell subset.
 *
 * client-v2 lane 定位：v3 settings 壳（/settings/workflow 的 flow-engine 工作流
 * 设计器）按 client-v2.js 标记注入本 lane。只服务 workflow **配置面**：
 *   - 触发器「审批事件」/ 审批指令注册（registerTrigger / registerInstruction）
 *   - 触发器/节点字段集 + 画布组件（fieldsets.jsx）
 *   - 发起/审批「页面模型」配置对话框的模型子集（models/registerModelLoaders.js）
 *   - 审批客户端集合 schema 注册 + approvalAudienceTypes（registerCollections /
 *     registerAudienceTypes）
 * 审批中心 / 任务卡 / 表单 UI **不进本 lane**——由 v3 portal 扩展承载
 * （portal/extension/，原生实现）：registerModelLoaders 整表 46 条、
 * registerTaskType（approval-apply / approval-todos）、applyNew 及 taskDetailCards
 * 等任务中心部件全部剥离（剥离决策见各文件头注释）。
 *
 * 骨架取自 git ab0c9db src/client-v2/index.jsx（808 行）中与 trigger/instruction
 * 注册相关的部分；useVariables 链路（approvalUseVariablesChildren）1:1 保留。
 */
const React = require('react');
const { AuditOutlined } = require('@ant-design/icons');
const { Plugin } = require('@nocobase/client-v2');
const { Trigger, Instruction } = require('@nocobase/plugin-workflow/client-v2');
const {
  getCollectionFieldOptions: wfGetCollectionFieldOptions,
  defaultFieldNames: wfDefaultFieldNames,
  parseCollectionName: wfParseCollectionName,
  useCurrentWorkflowContext: wfUseCurrentWorkflowContext,
  useFlowContext: wfUseFlowContext,
  getCollectionManagerAdapter: wfGetCollectionManagerAdapter,
} = require('@nocobase/plugin-workflow/client-v2');
let flowEngineGlobal = null;
try {
  flowEngineGlobal = require('@nocobase/flow-engine');
} catch (e) {
  flowEngineGlobal = null;
}
const {
  ApprovalTriggerPresetFieldset,
  ApprovalTriggerFieldset,
  ApprovalTriggerTestFieldset,
  ApprovalNodePresetFieldset,
  ApprovalNodeFieldset,
  ApprovalCanvasComponent,
  makeUid,
} = require('./fieldsets');
const { ensureApprovalCollections } = require('./models/interfaceConfig');
const { bindDataSourceLoaded } = require('./models/registerCollections');
const zhCN = require('./models/zh-CN');

function splitCollection(value) {
  if (!value) return ['main', ''];
  if (value.includes(':')) {
    const parts = value.split(':');
    if (parts[0] && parts[1]) return parts;
  }
  return ['main', value];
}

// ------------------------------------------------------------------ trigger

// 官方 useVariables D 函数的 children 部分（触发器 G 与审批指令 D 共用）：
// [nodeTitle/title/status/data.业务字段(appends)/records 五字段]。
// 节点配置抽屉渲染在 FlowContext 之外：dataSourceManager/t 回落到全局 flow-engine 实例。
function approvalUseVariablesChildren(config, options, flow) {
  const engineCtx = flowEngineGlobal?.useFlowEngine?.({ throwError: false })?.context ?? {};
  const engineT = typeof flow?.t === 'function' ? flow.t : typeof engineCtx?.t === 'function' ? engineCtx.t : null;
  // 官方 kj() 等价：审批插件 ns 优先、client 兜底（抽屉在 FlowContext 之外时走引擎 t）
  const t = engineT
    ? (text, opts) => engineT(text, { ns: ['@nocobase/plugin-workflow-approval', 'client'], nsMode: 'fallback', ...(opts ?? {}) })
    : (text) => text;
  const [ds, collectionName] = wfParseCollectionName(config?.collection);
  if (!collectionName) return null;
  const dataSourceManager = flow?.dataSourceManager ?? engineCtx?.dataSourceManager;
  if (!dataSourceManager) return null;
  const collectionManager = wfGetCollectionManagerAdapter(dataSourceManager, ds);
  const fields = wfGetCollectionFieldOptions({
    collection: collectionName,
    appends: config?.appends,
    compile: (text) => (typeof text === 'string' ? t(text, { ns: 'workflow', nsMode: 'fallback' }) : text),
    collectionManager,
  }, { fieldNames: options.fieldNames ?? wfDefaultFieldNames });
  return [
    { value: 'nodeTitle', label: t('Node title') },
    { value: 'title', label: t('Task title') },
    { value: 'status', label: t('Processed status') },
    { value: 'data', label: t('Data approved'), children: fields },
    {
      value: 'records',
      label: t('Approval records'),
      children: [
        { value: 'id', label: t('Record ID') },
        { value: 'userId', label: t('Assignee ID') },
        { value: 'status', label: t('Status') },
        { value: 'comment', label: t('Comment') },
        { value: 'updatedAt', label: t('Updated at') },
      ],
    },
  ];
}

function approvalWorkflowFromContext(flow) {
  const workflowCtx = wfUseCurrentWorkflowContext?.() ?? {};
  return flow?.view?.inputArgs?.flowContext?.workflow ?? workflowCtx;
}

class ApprovalTrigger extends Trigger {
  sync = false;
  title = '审批事件';
  description =
    '通过操作按钮或 API 发起审批申请时触发。专用于审批流程，具有专属的审批节点和审批区块，用于管理单据和跟踪审批过程。';

  PresetFieldsetLoader = () => Promise.resolve({ default: ApprovalTriggerPresetFieldset });
  FieldsetLoader = () => Promise.resolve({ default: ApprovalTriggerFieldset });
  TriggerFieldsetLoader = () => Promise.resolve({ default: ApprovalTriggerTestFieldset });

  createDefaultConfig() {
    return { mode: 0, centralized: false, audienceType: 1, recordShowMode: false, useSameTaskTitle: false };
  }

  // 官方触发器客户端钩子（module 7781 旁的 useVariables G）：为变量选择器提供
  // 「Trigger variables($context)」根 = [工作流名: nodeTitle/title/status/data.业务字段/records 字段]
  useVariables(config, options = {}) {
    const flow = wfUseFlowContext?.() ?? {};
    const workflow = approvalWorkflowFromContext(flow);
    const children = approvalUseVariablesChildren(config, options, flow);
    if (!children || !workflow?.key) return null;
    return [{ value: workflow.key, label: workflow.title, children }];
  }

  validate(config) {
    return !!(config?.collection);
  }

  // 官方 chunk（主包 Trigger.getCreateModelMenuItem）：界面搭建器「数据区块」菜单。
  // ApprovalDetailsModel 类不在本 lane 注册（审批中心模型族由 portal 承载），
  // 仅保留官方菜单声明——数据区块装配发生在界面搭建器环境。
  getCreateModelMenuItem({ config, nodeType }) {
    const NS = '@nocobase/plugin-workflow-approval';
    const t = (text) => `{{t(${JSON.stringify(text)}, { ns: "${NS}" })}}`;
    const items = [];
    if (nodeType !== 'cc') {
      items.push({
        key: 'approvalInformation',
        label: t('Approval information'),
        useModel: 'ApprovalDetailsModel',
        createModelOptions: {
          use: 'ApprovalDetailsModel',
          stepParams: {
            resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'approvals' } },
            cardSettings: { titleDescription: { title: t('Approval information') } },
          },
          subModels: { grid: { use: 'NodeDetailsGridModel', subType: 'object' } },
        },
      });
    }
    if (config?.collection) {
      const [ds, name] = splitCollection(config.collection);
      items.push({
        key: 'originalApplicationContent',
        label: t('Original application content'),
        useModel: 'NodeDetailsModel',
        createModelOptions: {
          use: 'NodeDetailsModel',
          stepParams: {
            resourceSettings: { init: { dataSourceKey: ds, collectionName: name, dataPath: '$context.data' } },
            cardSettings: { titleDescription: { title: t('Original application content') } },
          },
          subModels: { grid: { use: 'NodeDetailsGridModel', subType: 'object' } },
        },
      });
    }
    return items;
  }
}

// --------------------------------------------------------------- instruction

class ApprovalInstruction extends Instruction {
  title = '审批';
  type = 'approval';
  group = 'manual';
  async = true;
  description = '审批流程中的手动审批操作，审批人可以在全局审批区块或单条记录的审批区块中进行审批。';
  icon = React.createElement(AuditOutlined);

  PresetFieldsetLoader = () => Promise.resolve({ default: ApprovalNodePresetFieldset });
  FieldsetLoader = () => Promise.resolve({ default: ApprovalNodeFieldset });
  ComponentLoader = () => Promise.resolve({ default: ApprovalCanvasComponent });

  createDefaultConfig() {
    return { approvalUid: makeUid('approval_') };
  }

  // 官方指令类 T(e,"useVariables",D)：每个上游审批节点向宿主「节点数据($jobsMapByNodeKey)」
  // 根贡献一项 {value:node.key, label:node.title, children:[同触发器五字段]}。数据表与预载
  // 关联读工作流 config（官方 D 即读 workflow.config，节点仅出 key/title）。
  useVariables(node, options = {}) {
    if (!node?.key) return null;
    const flow = wfUseFlowContext?.() ?? {};
    const workflow = approvalWorkflowFromContext(flow);
    const children = approvalUseVariablesChildren(workflow?.config, options, flow);
    if (!children) return null;
    return { value: node.key, label: node.title, children };
  }

  branching(config) {
    if (!config?.branchMode) return null;
    return [
      { label: '通过', value: 2 },
      { label: '拒绝', value: -1 },
      { label: '退回', value: 1 },
    ];
  }

  // 官方 chunk（主包 Instruction.getCreateModelMenuItem）：节点结果数据区块菜单
  getCreateModelMenuItem({ workflow, node }) {
    const NS = '@nocobase/plugin-workflow-approval';
    const t = (text) => `{{t(${JSON.stringify(text)}, { ns: "${NS}" })}}`;
    const [ds, name] = splitCollection(workflow?.config?.collection);
    return {
      key: `#${node.id}`,
      label: node.title,
      children: [
        {
          key: 'data',
          label: t('Data approved'),
          useModel: 'NodeDetailsModel',
          createModelOptions: {
            use: 'NodeDetailsModel',
            stepParams: {
              resourceSettings: {
                init: { dataSourceKey: ds, collectionName: name, dataPath: `$jobsMapByNodeKey.${node.key}.data` },
              },
              cardSettings: { titleDescription: { title: t('Data approved') } },
            },
            subModels: { grid: { use: 'NodeDetailsGridModel', subType: 'object' } },
          },
        },
      ],
    };
  }
}

// -------------------------------------------------------------------- plugin

class PluginApprovalClientV2 extends Plugin {
  async load() {
    window.__approvalImplLoaded = true;
    const workflow = this.app.pm?.get?.('workflow');
    window.__approvalWorkflowClient = workflow;
    // 官方插件自带 locale；克隆版把 zh-CN 词条注册进命名空间，t(..., { ns }) 解析中文
    this.app.i18n?.addResourceBundle?.('@nocobase/plugin-workflow-approval', 'zh-CN', zhCN, true, true);
    // registerWorkflowExtensions：触发器 + 审批指令（settings 设计器的注册面本体）
    workflow?.registerTrigger?.('approval', ApprovalTrigger);
    workflow?.registerInstruction?.('approval', ApprovalInstruction);
    // registerCollections：官方 module 334——审批客户端集合 schema 补注册 +
    // handleDataSourceLoaded（数据源加载后重跑，含多数据源）
    const engine = this.flowEngine;
    if (engine) {
      ensureApprovalCollections(engine);
      bindDataSourceLoaded(this, engine);
      // registerAudienceTypes: flowEngine.context.approvalAudienceTypes（官方私有面，
      // 字段集读取；注册器为 no-op，类型固定 role/users）
      engine.context?.defineProperty?.('approvalAudienceTypes', {
        get: () => ({
          register: () => {},
          types: [{ key: 'role' }, { key: 'users' }],
        }),
      });
    }
    // lane 剥离：registerTaskType（approval-apply / approval-todos，任务中心列表与
    // 详情卡）、registerModelLoaders 整表（applyTaskCard / approvalTaskCard /
    // patternForm / centerBlocks / approvalDetails 模型族）不进本 lane——审批中心/
    // 任务卡/表单 UI 由 v3 portal 扩展承载。配置对话框所需页面模型子集由
    // models/registerModelLoaders.js 在对话框打开时按需注册（interfaceConfig）。
  }
}

module.exports = PluginApprovalClientV2;
module.exports.default = PluginApprovalClientV2;
