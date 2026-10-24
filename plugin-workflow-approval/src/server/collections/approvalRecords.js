/**
 * Collection definitions reverse-engineered from the official plugin's API payloads.
 */
const { defineCollection } = require('@nocobase/database');

const approvalRecords = defineCollection({
  name: 'approvalRecords',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'belongsTo', name: 'approval', target: 'approvals', foreignKey: 'approvalId' },
    { type: 'bigInt', name: 'approvalExecutionId' },
    { type: 'belongsTo', name: 'user', target: 'users', foreignKey: 'userId' },
    { type: 'bigInt', name: 'jobId', allowNull: true },
    { type: 'bigInt', name: 'executionId' },
    { type: 'bigInt', name: 'nodeId' },
    { type: 'bigInt', name: 'workflowId' },
    { type: 'integer', name: 'index', defaultValue: 0 },
    { type: 'string', name: 'title', allowNull: true },
    { type: 'integer', name: 'status', allowNull: true },
    { type: 'jsonb', name: 'comment', allowNull: true },
    { type: 'jsonb', name: 'snapshot', allowNull: true },
    { type: 'string', name: 'returnToNodeKey', allowNull: true },
    { type: 'string', name: 'type', defaultValue: 'Normal' },
    { type: 'bigInt', name: 'prevRecordId', allowNull: true },
    { type: 'jsonb', name: 'dataBefore', allowNull: true },
    { type: 'jsonb', name: 'dataAfter', allowNull: true },
    { type: 'belongsTo', name: 'node', target: 'flow_nodes', foreignKey: 'nodeId' },
    { type: 'belongsTo', name: 'job', target: 'jobs', foreignKey: 'jobId' },
    { type: 'belongsTo', name: 'approvalExecution', target: 'approvalExecutions', foreignKey: 'approvalExecutionId' },
    { type: 'belongsTo', name: 'execution', target: 'executions', foreignKey: 'executionId' },
    { type: 'belongsTo', name: 'workflow', target: 'workflows', foreignKey: 'workflowId' },
    { type: 'date', name: 'createdAt' },
    { type: 'date', name: 'updatedAt' },
  ],
});

module.exports = approvalRecords;
