/**
 * Collection definitions reverse-engineered from the official plugin's API payloads.
 */
const { defineCollection } = require('@nocobase/database');

const approvalMsgTpls = defineCollection({
  name: 'approvalMsgTpls',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'string', name: 'type', defaultValue: 'todo' },
    { type: 'string', name: 'title' },
    { type: 'string', name: 'notificationType' },
    { type: 'jsonb', name: 'template', defaultValue: null },
    { type: 'date', name: 'createdAt' },
    { type: 'date', name: 'updatedAt' },
  ],
});

module.exports = approvalMsgTpls;
