// Status enums reverse-engineered from the official plugin's client bundle & demo observations.
// See docs/01-reverse-engineering-master-report.md for evidence.

const EXECUTION_STATUS = {
  QUEUEING: null,
  STARTED: 0,
  RESOLVED: 1,
  FAILED: -1,
  ERROR: -2,
  ABORTED: -3,
  CANCELED: -4,
  REJECTED: -5,
  RETRY_NEEDED: -6,
};

// approvals.status
const APPROVAL_STATUS = {
  DRAFT: 0,
  RETURNED: 1,
  SUBMITTED: 2,
  PROCESSING: 3,
  APPROVED: 4,
  REJECTED: -1,
  FAILED: -2,
  ABORTED: -3,
};

// approvalRecords.status
const RECORD_STATUS = {
  ASSIGNED: null,
  PENDING: 0,
  RETURNED: 1,
  APPROVED: 2,
  UNPROCESSED: 3,
  PASSED: 4,
  DELEGATED: 8,
  REJECTED: -1,
  CANCELED: -2,
  WITHDRAWN: -3,
  ADDED: 99,
};

const RECORD_TYPE = {
  NORMAL: 'Normal',
  DELEGATED: 'Delegated',
  ADDED: 'Added',
};

// engine job status (subset used by the approval node result)
const JOB_STATUS = {
  PENDING: 0,
  RESOLVED: 1,
  FAILED: -1,
  ERROR: -2,
  ABORTED: -3,
  CANCELED: -4,
  REJECTED: -5,
  RETRY_NEEDED: -6,
};

const TASK_TYPE_APPLY = 'approval-apply';
const TASK_TYPE_TODOS = 'approval-todos';

const NAMESPACE = '@nocobase/plugin-workflow-approval';

module.exports = {
  EXECUTION_STATUS,
  APPROVAL_STATUS,
  RECORD_STATUS,
  RECORD_TYPE,
  JOB_STATUS,
  TASK_TYPE_APPLY,
  TASK_TYPE_TODOS,
  NAMESPACE,
};
