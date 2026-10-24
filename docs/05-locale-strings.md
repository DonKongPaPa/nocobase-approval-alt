# 05 — 字符串面（i18n surface）结构说明

> 本篇不收录词条原文全表（那是官方产品的文案资产，不应整表再分发）。这里记录的是
> **字符串面的结构事实**：键的形态、插值上下文、数量级与维护方式——这些是行为兼容
> 实现需要对齐的「契约」，不是可抄袭的文案。全部词条以本仓库插件自带的
> `plugin-workflow-approval/dist/locale/*.json`（随包维护）为准。

## 1. 键的形态

字符串键 = **en-US 源文案本身**（NocoBase 生态惯例，无命名空间前缀），形态分三类：

| 形态 | 例子（结构示意） | 数量级 |
| --- | --- | --- |
| 短 UI 标签 | `Approve` / `Add assignee` / `Any` | ~300 |
| 完整句配置说明 | `Allow the initiator to withdraw the approval before the approval starts.` | ~50 |
| 错误/状态消息 | `"filter.dataKey" is invalid and cannot be parsed.` / `Aborted` | ~20 |

## 2. 插值上下文（行为契约）

通知模板与消息使用 mustache 插值，可用变量是**服务端载荷契约的一部分**：

| 插值 | 来源 |
| --- | --- |
| `{{approval.nodeTitle}}` `{{approval.workflowTitle}}` `{{approval.approvalId}}` | 审批上下文（job 载荷/审批行） |
| `{{applicant.nickname}}` | 发起人用户 |
| `{{statusText}}` `{{round}}` `{{count}}` | 状态文案/轮次/计数 |
| `{{name}}` `{{message}}` | 通知渠道/错误消息 |

## 3. 关键中文对齐点（仅枚举存在性，非原文收录）

UI 面存在一组**协商模式术语**（会签/或签/任签/依次等）、**动作词**（通过/否决/退回/转签/加签/撤回）、
**状态词**（审批中/已通过/已拒绝/已退回/已委派/已取消/草稿）。这些词是行为测试（docs/13 矩阵）
UI 断言的锚点；兼容实现需在自身 locale 里提供等义翻译，具体措辞见 `dist/locale/zh-CN.json`。

## 4. 维护方式

- 兼容实现的词条**独立撰写与维护**（参考公开 UI 的可见文案做等义对齐，不整表复制）。
- 新增功能点时先补 `src/client/locale` 源 → 构建产出 `dist/locale`（build.js 4 lane 之一）。
- 与官方措辞的差异属于文案取舍，不影响行为矩阵判定（矩阵断言只锚定行为，不断言官方原文）。
