/**
 * registerApprovalModelLoaders (settings-lane subset) — derived from the
 * official main-bundle module 9813 port (git ab0c9db models/registerModelLoaders.js).
 *
 * client-v2 lane 定位：v3 settings 壳 workflow 配置面适配层。本文件只注册配置
 * 对话框（发起界面 / 审批界面）会用到的「页面模型」子集：
 *   TriggerChildPageModel / TriggerChildPageTabModel / TriggerBlockGridModel
 *   ApprovalChildPageModel / ApprovalChildPageTabModel / ApprovalBlockGridModel
 * 审批中心模型族（applyTaskCard / approvalTaskCard / patternForm / centerBlocks /
 * approvalDetails / taskDetailCards 共 40 条注册项）不进本 lane——由 v3 portal
 * 扩展承载（portal/extension 为原生实现，不复用 flow-engine 模型类）。
 */
const { TriggerChildPageModel, TriggerChildPageTabModel, TriggerBlockGridModel } = require('./triggerPageModels');
const { ApprovalChildPageModel, ApprovalChildPageTabModel, ApprovalBlockGridModel } = require('./approvalPageModels');

const GUARD = '__workflowApprovalModelLoadersRegistered__';
const registeredEngines = new WeakSet();

function syncLoad(module) {
  return async () => module;
}

/** Official module 9813 `s(e)`: register async model loaders (subset). */
export function registerApprovalModelLoaders(flowEngine) {
  if (!flowEngine || typeof flowEngine.registerModelLoaders !== 'function') return false;
  if (registeredEngines.has(flowEngine) || flowEngine[GUARD]) return false;
  flowEngine.registerModelLoaders({
    ApprovalChildPageModel: { extends: 'ChildPageModel', loader: syncLoad(ApprovalChildPageModel) },
    ApprovalChildPageTabModel: { extends: 'ChildPageTabModel', loader: syncLoad(ApprovalChildPageTabModel) },
    ApprovalBlockGridModel: { extends: 'BlockGridModel', loader: syncLoad(ApprovalBlockGridModel) },
    TriggerChildPageModel: { extends: 'ChildPageModel', loader: syncLoad(TriggerChildPageModel) },
    TriggerChildPageTabModel: { extends: 'ChildPageTabModel', loader: syncLoad(TriggerChildPageTabModel) },
    TriggerBlockGridModel: { extends: 'BlockGridModel', loader: syncLoad(TriggerBlockGridModel) },
  });
  registeredEngines.add(flowEngine);
  flowEngine[GUARD] = true;
  return true;
}

/** Config dialogs call this ensure helper before use (chunk 483/617 `(0, g.r)(p)`). */
export function ensureApprovalModelLoaders(flowEngine) {
  return registerApprovalModelLoaders(flowEngine);
}

export {
  TriggerChildPageModel,
  TriggerChildPageTabModel,
  TriggerBlockGridModel,
  ApprovalChildPageModel,
  ApprovalChildPageTabModel,
  ApprovalBlockGridModel,
};
