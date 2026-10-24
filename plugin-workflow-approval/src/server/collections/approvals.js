/**
 * Collection definitions reverse-engineered from the official plugin's API payloads.
 */
const { defineCollection } = require('@nocobase/database');

const approvals = defineCollection({
  name: 'approvals',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'string', name: 'collectionName' },
    { type: 'string', name: 'dataKey' },
    { type: 'belongsTo', name: 'workflow', target: 'workflows', foreignKey: 'workflowId' },
    { type: 'string', name: 'workflowKey' },
    { type: 'bigInt', name: 'latestExecutionId', allowNull: true },
    { type: 'integer', name: 'status', defaultValue: 0 },
    { type: 'jsonb', name: 'data', defaultValue: null },
    { type: 'jsonb', name: 'action', defaultValue: null },
    { type: 'string', name: 'applicantRoleName', allowNull: true },
    { type: 'bigInt', name: 'createdById', allowNull: true },
    { type: 'bigInt', name: 'updatedById', allowNull: true },
    { type: 'belongsTo', name: 'createdBy', target: 'users', foreignKey: 'createdById' },
    { type: 'hasMany', name: 'rounds', target: 'approvalExecutions', foreignKey: 'approvalId' },
    { type: 'hasMany', name: 'records', target: 'approvalRecords', foreignKey: 'approvalId' },
    { type: 'belongsTo', name: 'latestRound', target: 'approvalExecutions', foreignKey: 'latestExecutionId' },
    { type: 'date', name: 'createdAt' },
    { type: 'date', name: 'updatedAt' },
  ],
});

module.exports = approvals;
