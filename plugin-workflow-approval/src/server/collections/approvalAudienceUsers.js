/**
 * Collection definitions reverse-engineered from the official plugin's API payloads.
 */
const { defineCollection } = require('@nocobase/database');

const approvalAudienceUsers = defineCollection({
  name: 'approvalAudienceUsers',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'bigInt', name: 'workflowId' },
    { type: 'bigInt', name: 'userId' },
    { type: 'belongsTo', name: 'user', target: 'users', foreignKey: 'userId' },
    { type: 'date', name: 'createdAt' },
    { type: 'date', name: 'updatedAt' },
  ],
});

module.exports = approvalAudienceUsers;
