// Official notification semantics (alpha.10 demo wire evidence, 2026-10-14):
// - approval NODE  config.notifications → type 'todo'  → one message per assignee record
//   that becomes PENDING ("Send notifications to assignees when approval todo is assigned.").
// - approval TRIGGER config.notifications → type 'done' → one message to the applicant when the
//   approval terminates as approved/rejected/returned ("…when approval is done.").
// Entries: {channel: <notificationChannels.name>, templateType: 'template'|'custom',
//           template: <approvalMsgTpls.id> | {title, content}}.
// Rendering is delegated to plugin-notification-manager (Handlebars compile with `data`),
// receivers resolved as {type:'userId', value:[…]} by the in-app channel.
const PluginNotificationManager = require('@nocobase/plugin-notification-manager').default;

const { APPROVAL_STATUS, RECORD_STATUS } = require('./constants');

const BUILTIN_CHANNEL = 'approval-todo-in-app-message';

// done-template {{statusText}} — observed on demo: "* Result: Approved"
const STATUS_TEXT = {
  [APPROVAL_STATUS.APPROVED]: 'Approved',
  [APPROVAL_STATUS.REJECTED]: 'Rejected',
  [APPROVAL_STATUS.RETURNED]: 'Returned',
};

class ApprovalNotifications {
  constructor(plugin) {
    this.plugin = plugin;
    this._manager = undefined;
  }

  manager() {
    if (this._manager !== undefined) return this._manager;
    try {
      const p = this.plugin.app.pm.get(PluginNotificationManager) ?? this.plugin.app.pm.get('notification-manager');
      this._manager = p && typeof p.send === 'function' ? p : null;
    } catch (e) {
      this._manager = null;
    }
    return this._manager;
  }

  // Official install seeds: builtin channel + two default templates (demo ids 362853224022028/29).
  async seedDefaults() {
    const app = this.plugin.app;
    try {
      const channelsRepo = app.db.getRepository('notificationChannels');
      if (!(await channelsRepo.count({ filter: { name: BUILTIN_CHANNEL } }))) {
        await channelsRepo.create({
          values: {
            name: BUILTIN_CHANNEL,
            title: 'Approval notification',
            notificationType: 'in-app-message',
            meta: { editable: true, deletable: false },
          },
        });
      }
    } catch (e) {
      this.plugin.app.logger.warn(`[approval] seed builtin channel skipped: ${e.message}`);
    }
    try {
      const tplsRepo = app.db.getRepository('approvalMsgTpls');
      if ((await tplsRepo.count()) === 0) {
        await tplsRepo.create({
          values: {
            notificationType: 'in-app-message',
            title: 'Approval todo',
            type: 'todo',
            template: {
              title: 'Approval todo: {{approval.workflowTitle}} (#{{approval.approvalId}})',
              content: '* Task: {{approval.nodeTitle}}\n* Applicant: {{applicant.nickname}}',
            },
          },
        });
        await tplsRepo.create({
          values: {
            notificationType: 'in-app-message',
            title: 'Approval done',
            type: 'done',
            template: {
              title: 'Approval done: {{approval.workflowTitle}} (#{{approval.approvalId}})',
              content: '* Result: {{statusText}}',
            },
          },
        });
      }
    } catch (e) {
      this.plugin.app.logger.warn(`[approval] seed message templates skipped: ${e.message}`);
    }
  }

  // entries: [{channel, templateType, template}] → [{channel, message:{title, content}}]
  async resolveMessages(entries, type) {
    const messages = [];
    for (const entry of entries ?? []) {
      if (!entry?.channel) continue;
      if (entry.templateType === 'custom') {
        if (entry.template && typeof entry.template === 'object' && (entry.template.title || entry.template.content)) {
          messages.push({ channel: entry.channel, message: entry.template });
        }
      } else if (entry.template != null) {
        try {
          const row = await this.plugin.app.db.getRepository('approvalMsgTpls').findOne({
            filterByTk: entry.template,
          });
          if (row && row.get('template') && (!type || row.get('type') === type)) {
            messages.push({ channel: entry.channel, message: row.get('template') });
          }
        } catch (e) {
          this.plugin.app.logger.warn(`[approval] notification template #${entry.template} load failed: ${e.message}`);
        }
      }
    }
    return messages;
  }

  async send(channel, message, data, userIds, transaction) {
    const manager = this.manager();
    if (!manager || !userIds.length) return;
    try {
      await manager.send({
        channelName: channel,
        message,
        data,
        receivers: { type: 'userId', value: userIds },
        triggerFrom: 'approval',
        transaction,
      });
    } catch (e) {
      this.plugin.app.logger.warn(`[approval] notification send failed: ${e.message}`);
    }
  }

  // node entry / sequential gating: records that just became PENDING
  async sendTodo(node, workflowTitle, approval, records, transaction) {
    const entries = (node.config ?? {}).notifications;
    if (!entries?.length) return;
    const messages = await this.resolveMessages(entries, 'todo');
    if (!messages.length) return;
    let applicant = null;
    if (approval?.createdById != null) {
      try {
        // users repo findByTk misroutes in this env (filterByTk=3 returned user 1) — use filter form
        const user = await this.plugin.app.db.getRepository('users').findOne({
          filter: { id: approval.createdById },
          transaction,
        });
        applicant = { nickname: user?.get('nickname') ?? null };
      } catch (e) {
        applicant = null;
      }
    }
    const pending = (records ?? []).filter((r) => Number(r.get('status')) === RECORD_STATUS.PENDING);
    for (const rec of pending) {
      const data = {
        approval: {
          workflowTitle,
          approvalId: rec.get('approvalId'),
          dataKey: approval?.dataKey ?? null,
          nodeTitle: node.title,
          approvalRecordTitle: rec.get('title'),
          approvalRecordId: rec.get('id'),
        },
        applicant,
      };
      for (const m of messages) {
        await this.send(m.channel, m.message, data, [rec.get('userId')], transaction);
      }
    }
  }

  // terminal approval status → applicant (workflow-level trigger notifications)
  async sendDone(approval, { transaction } = {}) {
    if (![APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(approval.status)) {
      return;
    }
    const workflow = await this.plugin.app.db.getRepository('workflows').findOne({
      filterByTk: approval.workflowId,
      transaction,
    });
    const entries = workflow?.config?.notifications;
    if (!entries?.length) return;
    const messages = await this.resolveMessages(entries, 'done');
    if (!messages.length) return;
    const applicantId = approval.createdById;
    if (applicantId == null) return;
    const data = {
      statusText: STATUS_TEXT[approval.status] ?? null,
      approval: {
        workflowTitle: workflow?.title,
        approvalId: approval.id,
        dataKey: approval.dataKey ?? null,
      },
    };
    for (const m of messages) {
      await this.send(m.channel, m.message, data, [applicantId], transaction);
    }
  }
}

module.exports = { ApprovalNotifications, BUILTIN_CHANNEL };
