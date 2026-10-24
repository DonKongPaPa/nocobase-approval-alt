/**
 * Collection definitions reverse-engineered from the official plugin's API payloads.
 */
const { defineCollection } = require('@nocobase/database');

const approvalExecutions = defineCollection({
  name: 'approvalExecutions',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'belongsTo', name: 'approval', target: 'approvals', foreignKey: 'approvalId' },
    { type: 'bigInt', name: 'executionId' },
    { type: 'belongsTo', name: 'execution', target: 'executions', foreignKey: 'executionId' },
    { type: 'integer', name: 'status', allowNull: true },
    { type: 'string', name: 'reason', allowNull: true },
    { type: 'jsonb', name: 'snapshot', defaultValue: null },
    { type: 'date', name: 'createdAt' },
    { type: 'date', name: 'updatedAt' },
  ],
});

module.exports = approvalExecutions;
