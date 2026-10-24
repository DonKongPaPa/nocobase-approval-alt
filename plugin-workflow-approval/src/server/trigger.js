const { Trigger } = require('@nocobase/plugin-workflow');
const Joi = require('joi');
const { APPROVAL_STATUS } = require('./constants');
const { loadRecord } = require('./service');

// The approval trigger is API/action driven (probe: "Triggered when an approval request
// is initiated through an action button or API") — it binds no collection hooks itself.
class ApprovalTrigger extends Trigger {
  static TYPE = 'approval';

  title = 'Approval event';
  // sync=false: async execution after submission
  sync = false;

  // Manual test run ("Execute manually" dialog): create an approval directly from
  // the provided trigger variables and hand the execution to the dispatcher.
  async execute(workflow, values, options = {}) {
    const plugin = this.workflow;
    const db = plugin.app.db;
    const config = workflow.config ?? {};
    const collectionName = String(config.collection ?? '').includes(':')
      ? config.collection.split(':')[1]
      : config.collection;
    if (!collectionName) {
      throw new Error('approval workflow has no collection configured');
    }
    const raw = values?.data;
    const dataKey = raw != null && typeof raw === 'object' ? raw.id : raw;
    if (dataKey == null) {
      throw new Error('Trigger data is required');
    }
    const record = await loadRecord(plugin.app, collectionName, dataKey);
    if (!record) {
      throw new Error(`Record ${dataKey} not found in ${collectionName}`);
    }
    const applicantId = values?.applicantId ?? null;
    const approval = await db.getRepository('approvals').create({
      values: {
        collectionName,
        dataKey: String(record.get('id')),
        workflowId: workflow.id,
        workflowKey: workflow.key,
        status: APPROVAL_STATUS.SUBMITTED,
        data: record.toJSON(),
        action: { values, actionName: 'execute', resourceName: 'workflows' },
        applicantRoleName: values?.applicantRoleName ?? null,
        createdById: applicantId,
        updatedById: applicantId,
      },
      transaction: options.transaction,
    });
    const round = await db.getRepository('approvalExecutions').create({
      values: { approvalId: approval.id, executionId: null, status: null, snapshot: approval.data },
      transaction: options.transaction,
    });
    await db.getRepository('approvals').update({
      filterByTk: approval.id,
      values: { latestExecutionId: round.id },
      transaction: options.transaction,
    });
    approval.latestExecutionId = round.id;
    const context = {
      data: { ...(approval.data ?? {}), id: approval.dataKey },
      approvalId: approval.id,
      approvalRoundId: round.id,
    };
    return plugin.trigger(workflow, context, {
      ...options,
      transaction: plugin.useDataSourceTransaction('main', options.transaction),
    });
  }

  configSchema = Joi.object({
    collection: Joi.string().required(),
    mode: Joi.number().valid(0, 1).optional(), // 0 before-save, 1 after-save (official create flow omits it)
    appends: Joi.array().items(Joi.string()).optional(),
    centralized: Joi.boolean().optional(),
    audienceType: Joi.number().valid(0, 1).optional(),
    withdrawable: Joi.boolean().optional(),
    recordShowMode: Joi.boolean().optional(), // false snapshot / true latest
    associationShowMode: Joi.boolean().optional(),
    useSameTaskTitle: Joi.boolean().optional(),
    taskTitle: Joi.string().allow(null, '').optional(),
    autoPassIfApplicant: Joi.boolean().optional(),
    autoPassIfApprovedInRound: Joi.boolean().optional(),
    usageInstructions: Joi.string().allow(null, '').optional(),
    approvalUid: Joi.string().allow(null, '').optional(),
    taskCardUid: Joi.string().allow(null, '').optional(),
    applyFields: Joi.array().items(Joi.string()).optional(),
    cardFields: Joi.array().items(Joi.string()).optional(),
    notifications: Joi.array().items(Joi.object()).optional(),
  }).unknown(true);

  createDefaultConfig() {
    return {
      collection: null,
      mode: 0,
      appends: [],
      centralized: false,
      audienceType: 1,
      recordShowMode: false,
      useSameTaskTitle: false,
      autoPassIfApplicant: false,
      autoPassIfApprovedInRound: false,
    };
  }
}

module.exports = ApprovalTrigger;
