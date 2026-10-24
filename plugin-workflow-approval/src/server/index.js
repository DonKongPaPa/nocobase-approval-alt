const { Plugin } = require('@nocobase/server');
const ApprovalTrigger = require('./trigger');
const ApprovalInstruction = require('./instruction');
const { approvalsActions, approvalRecordsActions, reassigneesActions, listApprovalFlows } = require('./actions');
const {
  APPROVAL_STATUS,
  RECORD_STATUS,
  JOB_STATUS,
  EXECUTION_STATUS,
  TASK_TYPE_APPLY,
  TASK_TYPE_TODOS,
} = require('./constants');
const { loadRecord, writeRecordData, aggregateDecision, stampRemainders, applySequentialGating } = require('./service');
const { ApprovalNotifications } = require('./notifications');

const PLUGIN_NAME = 'workflow-approval';

class PluginWorkflowApprovalServer extends Plugin {
  async beforeLoad() {
    this.notifications = new ApprovalNotifications(this);
    this.app.resourceManager.define({
      name: 'approvals',
      actions: approvalsActions,
    });
    this.app.resourceManager.define({
      name: 'approvalRecords',
      actions: approvalRecordsActions,
    });
    this.app.resourceManager.define({
      name: 'approvalRecords.reassignees',
      actions: reassigneesActions,
    });
  }

  async load() {
    // collections are auto-loaded from dist/server/collections/

    const workflowPlugin = this.app.pm.get('@nocobase/plugin-workflow');
    if (!workflowPlugin) {
      this.app.logger.warn('workflow plugin not found, approval features disabled');
      return;
    }
    workflowPlugin.registerTrigger('approval', ApprovalTrigger);
    workflowPlugin.registerInstruction('approval', ApprovalInstruction);

    // task-center badge statistics (same provider contract as workflow-manual)
    workflowPlugin.registerTaskStatsProvider?.(TASK_TYPE_APPLY, {
      collectTaskStats: (options) => this.collectApplyStats(options),
    });
    workflowPlugin.registerTaskStatsProvider?.(TASK_TYPE_TODOS, {
      collectTaskStats: (options) => this.collectTodoStats(options),
    });

    this.app.acl.allow('approvals', ['create', 'update', 'destroy', 'withdraw', 'get', 'listMine', 'listRelated'], 'loggedIn');
    // task-center "Apply new" drawer source (official workflows:listApprovalFlows)
    this.app.resourceManager.registerActionHandler('workflows:listApprovalFlows', listApprovalFlows);
    this.app.acl.allow('workflows', 'listApprovalFlows', 'loggedIn');
    this.app.acl.allow('approvalRecords', ['get', 'listMine', 'submit', 'return', 'delegate', 'add'], 'loggedIn');
    this.app.acl.allow('approvalRecords.reassignees', ['list'], 'loggedIn');
    this.app.acl.allow('approvalMsgTpls', ['list', 'create', 'update', 'destroy'], 'loggedIn');
    this.app.acl.allow('approvalAudiences', ['list', 'replace'], 'loggedIn');

    this.db.on('executions.afterUpdate', this.onExecutionStatusChange);

    // official install seeds the builtin channel + two default templates (idempotent)
    this.app.on('afterStart', async () => {
      await this.notifications.seedDefaults();
    });
  }

  async collectApplyStats({ userIds = [], workflowKeys = [], transaction } = {}) {
    if (!userIds.length) return [];
    const Approvals = this.db.getRepository('approvals');
    const where = { createdById: { $in: userIds } };
    if (workflowKeys?.length) {
      where.workflowKey = { $in: workflowKeys };
    }
    const rows = await this.db.getRepository('approvals').find({
      filter: where,
      fields: ['id', 'createdById', 'workflowId', 'workflowKey', 'status'],
      transaction,
    });
    const PENDING_SET = [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.RETURNED, APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.PROCESSING];
    const map = new Map();
    for (const r of rows) {
      const key = `${r.get('createdById')}\t${r.get('workflowKey')}`;
      const item = map.get(key) ?? {
        userId: r.get('createdById'),
        workflowKey: r.get('workflowKey'),
        type: TASK_TYPE_APPLY,
        pending: 0,
        all: 0,
      };
      item.all += 1;
      if (PENDING_SET.includes(Number(r.get('status')))) item.pending += 1;
      map.set(key, item);
    }
    return Array.from(map.values());
  }

  async collectTodoStats({ userIds = [], workflowKeys = [], transaction } = {}) {
    if (!userIds.length) return [];
    const rows = await this.db.getRepository('approvalRecords').find({
      filter: {
        userId: { $in: userIds },
        ...(workflowKeys?.length ? { workflowId: { $ne: null } } : {}),
      },
      fields: ['id', 'userId', 'workflowId', 'status', 'approvalExecutionId'],
      transaction,
    });
    // filter by approval status in [2,3] for pending
    const execIds = Array.from(new Set(rows.map((r) => r.get('approvalExecutionId')).filter(Boolean)));
    const rounds = execIds.length
      ? await this.db.getRepository('approvalExecutions').find({
          filter: { id: { $in: execIds } },
          fields: ['id', 'status'],
          transaction,
        })
      : [];
    const roundStatus = new Map(rounds.map((r) => [String(r.get('id')), r.get('status')]));
    const wfIds = Array.from(new Set(rows.map((r) => r.get('workflowId')).filter(Boolean)));
    const workflows = wfIds.length
      ? await this.db.getRepository('workflows').find({
          filter: { id: { $in: wfIds } },
          attributes: ['id', 'key'],
          transaction,
        })
      : [];
    const wfKey = new Map(workflows.map((w) => [w.get('id'), w.get('key')]));
    const map = new Map();
    for (const r of rows) {
      const key = wfKey.get(r.get('workflowId'));
      if (!key || !workflowKeys?.length || workflowKeys.includes(key)) {
        const mapKey = `${r.get('userId')}\t${key}`;
        const item = map.get(mapKey) ?? {
          userId: r.get('userId'),
          workflowKey: key,
          type: TASK_TYPE_TODOS,
          pending: 0,
          all: 0,
        };
        item.all += 1;
        const recStatus = Number(r.get('status'));
        const roundSt = roundStatus.get(String(r.get('approvalExecutionId')));
        if (
          recStatus === RECORD_STATUS.PENDING &&
          (roundSt === null || roundSt === EXECUTION_STATUS.STARTED)
        ) {
          item.pending += 1;
        }
        map.set(mapKey, item);
      }
    }
    return Array.from(map.values()).filter((x) => x.workflowKey);
  }

  // approval.status → PROCESSING when a round is partially decided (probes A/B/C/P-E)
  async setProcessing(record) {
    const Approvals = this.db.getRepository('approvals');
    const approval = await Approvals.findOne({ filterByTk: record.get('approvalId') });
    if (approval && Number(approval.get('status')) === APPROVAL_STATUS.SUBMITTED) {
      await Approvals.update({
        filterByTk: approval.id,
        values: { status: APPROVAL_STATUS.PROCESSING },
      });
    }
  }

  // Called after a record was acted on (submit/approve/reject/return-without-target).
  // Aggregates the node decision and resumes the engine when decided.
  // Official job-result payload (simulation matrix SIMA1/2/5/8, docs/13):
  //   { status: <action status, or approval status on auto>, data: <full business
  //    record snapshot>, records: [{id,status,userId,comment}] — the records key
  //    appears only when the node reached an outcome }
  async buildJobPayload(approval, status, { withRecords = false, records = [] } = {}) {
    const rec = await loadRecord(this.app, approval.collectionName, approval.dataKey);
    const payload = {
      status,
      data: rec ? rec.toJSON() : { id: approval.dataKey },
    };
    if (withRecords) {
      // official payloads carry updatedAt ONLY on records modified by the
      // resolution stamping (the acting record predates the payload write)
      payload.records = records.map((r) => {
        const entry = {
          id: Number(r.get('id')),
          status: r.get('status'),
          userId: r.get('userId'),
          comment: r.get('comment') ?? null,
        };
        if (Number(r.get('status')) === RECORD_STATUS.UNPROCESSED) {
          entry.updatedAt = r.get('updatedAt') ?? null;
        }
        return entry;
      });
    }
    return payload;
  }

  async onRecordActed(record, submittedData, { returned = false } = {}) {
    const db = this.app.db;
    await this.setProcessing(record);

    // aggregate only the records of the CURRENT run of this node (latest job),
    // mirroring the engine's latest-job-per-node rule — older runs (e.g. records
    // returned before a returnToNode re-run) must not poison the decision
    const records = await db.getRepository('approvalRecords').find({
      filter: {
        approvalExecutionId: record.get('approvalExecutionId'),
        nodeId: record.get('nodeId'),
        jobId: record.get('jobId'),
      },
    });
    const node = await db.getRepository('flow_nodes').findOne({ filterByTk: record.get('nodeId') });
    const config = node?.config ?? {};
    const decision = aggregateDecision(records.map((r) => r.toJSON()), config);

    if (!decision.done) {
      // undecided node — official still rewrites the core job payload with the
      // action status + business snapshot, without records (SIMA2/3/4 wire)
      const job0 = await this.findJob(record.get('jobId'));
      if (job0) {
        const approval0 = await db.getRepository('approvals').findOne({ filterByTk: record.get('approvalId') });
        if (approval0) {
          job0.result = await this.buildJobPayload(approval0, Number(record.get('status')));
          job0.changed('result', true);
          await job0.save();
        }
      }
      // sequential mode: open the next approver's record after the current actor finished
      if (config.order) {
        applySequentialGating(records);
        const opened = [];
        for (const r of records) {
          if (r.changed?.('status')) {
            await db.getRepository('approvalRecords').update({
              filterByTk: r.get('id'),
              values: { status: r.status },
            });
            if (Number(r.get('status')) === RECORD_STATUS.PENDING) opened.push(r);
          }
        }
        // sequentially gated todo just opened → notify its assignee
        if (opened.length) {
          const approval = await db.getRepository('approvals').findOne({
            filterByTk: record.get('approvalId'),
          });
          const workflow = approval
            ? await db.getRepository('workflows').findOne({ filterByTk: approval.workflowId })
            : null;
          await this.notifications.sendTodo(node, workflow?.title, approval, opened);
        }
      }
      return;
    }
    if (decision.outcome === RECORD_STATUS.RETURNED && returned) {
      stampRemainders(records, decision.outcome);
      for (const r of records) {
        await db.getRepository('approvalRecords').update({
          filterByTk: r.get('id'),
          values: { status: r.status },
        });
      }
      const job = await this.findJob(record.get('jobId'));
      if (!job) return;
      const approvalR = await db.getRepository('approvals').findOne({ filterByTk: record.get('approvalId') });
      // Decided return carries the decision like approve/reject: official wire
      // (SIMA6, alpha.12) = {status:1, data, records:[returned record]} on the
      // -6 job — NOT the undecided {status:0} form (that is the returnToNode
      // in-place reset, SIMA13, a different path).
      job.result = await this.buildJobPayload(approvalR, RECORD_STATUS.RETURNED, { withRecords: true, records });
      job.changed('result', true);
      // official writes core job statuses so timeline dots match (return => RETRY_NEEDED/-6)
      job.status = JOB_STATUS.RETRY_NEEDED;
      job.changed('status', true);
      const workflowPlugin = this.app.pm.get('@nocobase/plugin-workflow');
      await workflowPlugin.resume(job);
      return;
    }
    if (decision.outcome === RECORD_STATUS.APPROVED || decision.outcome === RECORD_STATUS.REJECTED) {
      stampRemainders(records, decision.outcome);
      for (const r of records) {
        await db.getRepository('approvalRecords').update({
          filterByTk: r.get('id'),
          values: { status: r.status },
        });
      }
      const job = await this.findJob(record.get('jobId'));
      if (!job) return;
      const approvalD = await db.getRepository('approvals').findOne({ filterByTk: record.get('approvalId') });
      job.result = await this.buildJobPayload(approvalD, decision.outcome, { withRecords: true, records });
      job.changed('result', true);
      // official writes core job statuses (approve => RESOLVED/1, reject => REJECTED/-5)
      job.status = decision.outcome === RECORD_STATUS.APPROVED ? JOB_STATUS.RESOLVED : JOB_STATUS.REJECTED;
      job.changed('status', true);
      const workflowPlugin = this.app.pm.get('@nocobase/plugin-workflow');
      await workflowPlugin.resume(job);
    }
  }

  async findJob(jobId) {
    const jobs = await this.db.getRepository('jobs').find({
      filter: { id: Number(jobId) },
      limit: 1,
    });
    return jobs[0] ?? null;
  }

  // returnToNodeKey: re-run the flow from the target node in the SAME round (probe P-E).
  async returnToNode(ctx, record, nodeKeyOrId, submittedData) {
    const db = this.app.db;
    const executionId = record.get('executionId');
    const execution = await db.getRepository('executions').findOne({ filterByTk: executionId });
    if (!execution || Number(execution.get('status')) !== EXECUTION_STATUS.STARTED) {
      return false;
    }
    const nodes = await db.getRepository('flow_nodes').find({
      filter: { workflowId: record.get('workflowId') },
    });
    const target = nodes.find(
      (n) => n.get('key') === nodeKeyOrId || String(n.get('id')) === String(nodeKeyOrId),
    );
    if (!target || target.get('type') !== 'approval') {
      return false;
    }
    // only upstream approval nodes of the current node are valid targets
    const isUpstream = await this.isUpstreamNode(nodes, target.get('id'), record.get('nodeId'));
    if (!isUpstream) {
      return false;
    }
    // alpha.12 (SIMA13 wire): in-place reuse — the acting record is repurposed
    // as the target node's pending record; the current job resets to PENDING
    // with a reset payload. No CANCELED rows, no RETRY_NEEDED job, no rerun —
    // official end state is 2 records ([target-old, repurposed]) + 2 jobs
    // ([passed 1, reset 0]).
    await db.getRepository('approvalRecords').update({
      filterByTk: record.id,
      values: {
        status: RECORD_STATUS.PENDING,
        nodeId: target.get('id'),
        title: target.get('title') ?? null,
        returnToNodeKey: null,
      },
    });
    const job = await this.findJob(record.get('jobId'));
    if (job) {
      const approvalR = await db.getRepository('approvals').findOne({
        filterByTk: record.get('approvalId'),
      });
      job.status = JOB_STATUS.PENDING;
      job.result = await this.buildJobPayload(approvalR, 0);
      job.changed('status', true);
      job.changed('result', true);
      await job.save();
    }
    return true;
  }

  async isUpstreamNode(nodes, upstreamId, nodeId, depth = 0) {
    if (depth > 200) return false;
    const node = nodes.find((n) => String(n.get('id')) === String(nodeId));
    if (!node) return false;
    const up = node.get('upstreamId');
    if (up == null) return false;
    if (String(up) === String(upstreamId)) return true;
    return this.isUpstreamNode(nodes, upstreamId, up, depth + 1);
  }

  // Terminal approval statuses are derived at execution end (probe T1/T2/T3/T4).
  onExecutionStatusChange = async (execution, { transaction } = {}) => {
    const rawStatus = execution.get('status');
    // official keeps the round status null while the execution is running/queued
    if (rawStatus == null || rawStatus === EXECUTION_STATUS.STARTED) return;
    const status = Number(rawStatus);
    if (Number.isNaN(status)) return;
    const db = this.app.db;
    const rounds = await db.getRepository('approvalExecutions').find({
      filter: { executionId: execution.get('id') },
      transaction,
    });
    for (const round of rounds) {
      const approval = await db.getRepository('approvals').findOne({
        filterByTk: round.get('approvalId'),
        transaction,
      });
      if (!approval) continue;
      const isLatest = String(approval.get('latestExecutionId')) === String(round.get('id'));

      let roundStatus = status;
      let approvalStatus = null;
      let data = approval.get('data');

      if (status === EXECUTION_STATUS.RESOLVED) {
        // outcome from the LAST approval node result in this execution
        const jobs = await db.getRepository('jobs').find({
          filter: { executionId: execution.get('id') },
          transaction,
        });
        const nodeIds = (jobs ?? []).map((j) => j.get('nodeId'));
        const nodes = nodeIds.length
          ? await db.getRepository('flow_nodes').find({ filter: { id: { $in: nodeIds } }, transaction })
          : [];
        const approvalJobs = jobs
          .filter((j) => nodes.find((n) => String(n.get('id')) === String(j.get('nodeId')) && n.get('type') === 'approval'))
          .sort((a, b) => Number(a.get('id')) - Number(b.get('id')));
        const lastResult = approvalJobs[approvalJobs.length - 1]?.get('result') ?? {};
        const outcome = Number(lastResult.status);
        if (outcome === RECORD_STATUS.APPROVED) {
          approvalStatus = APPROVAL_STATUS.APPROVED;
          // mode 0: write the accumulated data into the business record on final approval
          const workflow = await db.getRepository('workflows').findOne({
            filterByTk: approval.get('workflowId'),
            transaction,
          });
          if ((workflow?.config?.mode ?? 0) === 0 && approval.get('dataKey') != null) {
            const finalData = lastResult.data ?? approval.get('data') ?? {};
            try {
              await writeRecordData(this.app, approval.get('collectionName'), approval.get('dataKey'), finalData, transaction);
              const fresh = await loadRecord(this.app, approval.get('collectionName'), approval.get('dataKey'), { transaction });
              data = fresh ? fresh.toJSON() : data;
            } catch (e) {
              this.app.logger.error(`[approval] final data write failed: ${e.message}`);
            }
          }
        } else if (outcome === RECORD_STATUS.REJECTED) {
          approvalStatus = APPROVAL_STATUS.REJECTED;
        } else {
          approvalStatus = APPROVAL_STATUS.APPROVED; // flow resolved without explicit reject (e.g. auto)
        }
      } else if (status === EXECUTION_STATUS.RETRY_NEEDED) {
        approvalStatus = APPROVAL_STATUS.RETURNED;
      } else if (status === EXECUTION_STATUS.REJECTED) {
        // engine terminal for a REJECTED job (instruction.route straight-mode fix,
        // story #2/#5: L1 reject used to fall through RESOLVED and open L2)
        approvalStatus = APPROVAL_STATUS.REJECTED;
      } else if (status === EXECUTION_STATUS.CANCELED) {
        approvalStatus = APPROVAL_STATUS.DRAFT;
      } else if (status === EXECUTION_STATUS.FAILED) {
        approvalStatus = APPROVAL_STATUS.REJECTED;
      } else if (status === EXECUTION_STATUS.ERROR) {
        approvalStatus = APPROVAL_STATUS.FAILED;
      } else if (status === EXECUTION_STATUS.ABORTED) {
        approvalStatus = APPROVAL_STATUS.ABORTED;
      }

      if (isLatest) {
        await db.getRepository('approvalExecutions').update({
          filterByTk: round.get('id'),
          values: { status: roundStatus },
          transaction,
        });
        if (approvalStatus != null) {
          await db.getRepository('approvals').update({
            filterByTk: approval.get('id'),
            values: { status: approvalStatus, ...(approvalStatus === APPROVAL_STATUS.APPROVED ? { data } : {}) },
            transaction,
          });
          // done notifications to the applicant (official trigger-level notifications)
          try {
            await this.notifications.sendDone(
              { ...approval.toJSON(), status: approvalStatus },
              { transaction },
            );
          } catch (e) {
            this.app.logger.warn(`[approval] done notification failed: ${e.message}`);
          }
        }
      } else {
        await db.getRepository('approvalExecutions').update({
          filterByTk: round.get('id'),
          values: { status: roundStatus },
          transaction,
        });
      }
    }
  };
}

module.exports = PluginWorkflowApprovalServer;
module.exports.PluginWorkflowApprovalServer = PluginWorkflowApprovalServer;
module.exports.default = PluginWorkflowApprovalServer;
