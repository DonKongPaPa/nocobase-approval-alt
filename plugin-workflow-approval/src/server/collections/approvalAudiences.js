/**
 * Collection definitions reverse-engineered from the official plugin's API payloads.
 */
const { defineCollection } = require('@nocobase/database');

const approvalAudiences = defineCollection({
  name: 'approvalAudiences',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'bigInt', name: 'workflowId' },
    { type: 'string', name: 'type', defaultValue: 'role' },
    { type: 'string', name: 'targetKey' },
    { type: 'date', name: 'createdAt' },
    { type: 'date', name: 'updatedAt' },
  ],
});

module.exports = approvalAudiences;
