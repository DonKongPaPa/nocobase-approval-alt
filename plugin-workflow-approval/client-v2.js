/**
 * client-v2 lane 标记（v3 settings 壳注入点）：settings 壳按本文件识别插件是否
 * 提供 client-v2 lane，并注入 @nocobase/plugin-workflow-approval/client-v2 UMD。
 * 本 lane 只服务 workflow 配置面（触发器/审批节点/画布）；审批中心 UI 由
 * v3 portal 扩展承载。
 */
module.exports = require('./dist/client-v2/index.js');
