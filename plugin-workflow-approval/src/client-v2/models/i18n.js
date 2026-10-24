/**
 * Translator hook for the approval client-v2 lane — extracted 1:1 from git
 * ab0c9db models/approvalTimeline.jsx:103-106 (official module 9488 `ws`:
 * ns: [approval, client] fallback translator).
 *
 * client-v2 lane 定位：v3 settings 壳 workflow 配置面适配层。notificationsFieldset
 * 只需要这一个翻译钩子；approvalTimeline 本体（TaskApprovalTimeline 时间线组件，
 * 审批中心/任务详情 UI）不进本 lane——由 v3 portal 扩展承载。
 */
const React = require('react');
const { useTranslation } = require('react-i18next');
const { NS } = require('./shared');

export function useApprovalTranslate() {
  const { t, i18n } = useTranslation([NS, 'client'], { nsMode: 'fallback' });
  const language = i18n.resolvedLanguage || i18n.language;
  return React.useMemo(() => t, [language]); // eslint-disable-line react-hooks/exhaustive-deps
}
