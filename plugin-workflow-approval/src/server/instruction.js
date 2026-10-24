const { Instruction, JOB_STATUS } = require('@nocobase/plugin-workflow');
const { RECORD_STATUS, RECORD_TYPE } = require('./constants');
const {
  resolveAssignees,
  aggregateDecision,
  applySequentialGating,
  stampRemainders,
  loadRecord,
} = require('./service');

// Branch indexes of an approval node in branch mode (probe P-E, demo quotation flow).
const BRANCH_INDEX = {
  REJECTED: -1,
  RETURNED: 1,
  APPROVED: 2,
};

class ApprovalInstruction extends Instruction {
  async run(node, prevJob, processor, options = {}) {
    const app = this.workflow.app;
    const db = app.db;
    const config = node.config ?? {};
    const execution = processor.execution;

    // the round is created at submission time; bind the execution id on first run
    // (async trigger does not expose the execution id to the action layer)
    let round = await db.getRepository('approvalExecutions').findOne({
      filterByTk: execution.context?.approvalRoundId,
      transaction: processor.transaction,
    });
    if (!round) {
      round = await db.getRepository('approvalExecutions').findOne({
        filter: { approvalId: execution.context?.approvalId, executionId: execution.id },
        transaction: processor.transaction,
      });
    }
    if (round && round.get('executionId') == null) {
      await db.getRepository('approvalExecutions').update({
        filterByTk: round.get('id'),
        values: { executionId: execution.id },
        transaction: processor.transaction,
      });
      round.set({ executionId: execution.id });
    }
    const approval = round
      ? await db.getRepository('approvals').findOne({
          filterByTk: round.approvalId,
          transaction: processor.transaction,
        })
      : null;

    const workflow = approval
      ? await db.getRepository('workflows').findOne({ filterByTk: approval.workflowId })
      : null;
    const triggerConfig = workflow?.config ?? {};

    const dataBefore = approval ? await this.snapshotBusinessData(app, approval, processor) : null;

    // Resolve assignees (probes P-F / P-F2 / P-I)
    app.logger.warn();
    const assignees = await resolveAssignees(
      app,
      this.workflow,
      config,
      execution.context?.data ?? {},
      processor.transaction,
    );

    const job = await this.createJob(node, prevJob, processor);

    // probe P-F: unresolved/empty assignees → node auto-passes with no records
    if (!assignees.length) {
      return await this.decideAndRoute(node, processor, approval, job, {
        status: RECORD_STATUS.APPROVED,
        auto: true,
        empty: true,
      });
    }

    const title = config.title ?? node.title;
    const RecordsRepo = db.getRepository('approvalRecords');

    const records = [];
    for (let i = 0; i < assignees.length; i++) {
      const userId = assignees[i];
      let status = RECORD_STATUS.PENDING;
      if (!config.forceManualApproval && approval) {
        if (
          triggerConfig.autoPassIfApplicant &&
          Number(approval.createdById) === userId
        ) {
          status = RECORD_STATUS.APPROVED; // probe P-G
        } else if (
          triggerConfig.autoPassIfApprovedInRound &&
          (await RecordsRepo.count({
            filter: {
              approvalExecutionId: round.id,
              userId,
              status: RECORD_STATUS.APPROVED,
            },
            transaction: processor.transaction,
          })) > 0
        ) {
          status = RECORD_STATUS.APPROVED; // probe P-H
        }
      }
      const rec = await RecordsRepo.create({
        values: {
          approvalId: round.approvalId,
          approvalExecutionId: round.id,
          userId,
          jobId: job.get('id'),
          executionId: execution.id,
          nodeId: node.id,
          workflowId: node.workflowId,
          index: config.order ? i : records.length,
          title,
          status,
          type: RECORD_TYPE.NORMAL,
          dataBefore,
        },
        transaction: processor.transaction,
      });
      records.push(rec);
    }

    if (config.order) {
      applySequentialGating(records); // probe P-C
      for (const r of records) {
        await RecordsRepo.update({
          filterByTk: r.get('id'),
          values: { status: r.status },
          transaction: processor.transaction,
        });
      }
    }

    // todo notifications for records that opened as PENDING (official "todo assigned" semantics)
    try {
      const approvalPlugin = this.workflow.app.pm.get('@nocobase/plugin-workflow-approval');
      await approvalPlugin.notifications.sendTodo(node, workflow?.title, approval, records, processor.transaction);
    } catch (e) {
      this.workflow.app.logger.warn(`[approval] todo notification failed: ${e.message}`);
    }

    const decision = aggregateDecision(records, config);
    if (decision.done && decision.outcome !== RECORD_STATUS.RETURNED) {
      stampRemainders(records, decision.outcome);
      for (const r of records) {
        await RecordsRepo.update({
          filterByTk: r.get('id'),
          values: { status: r.status },
          transaction: processor.transaction,
        });
      }
      return await this.decideAndRoute(node, processor, approval, job, {
        status: decision.outcome,
        auto: true,
      });
    }

    return job; // PENDING
  }

  async createJob(node, prevJob, processor) {
    return processor.saveJob({
      status: JOB_STATUS.PENDING,
      result: { status: null, data: null },
      nodeId: node.id,
      nodeKey: node.key,
      upstreamId: prevJob?.id ?? null,
    });
  }

  async snapshotBusinessData(app, approval, processor) {
    const rec = await loadRecord(app, approval.collectionName, approval.dataKey, {
      transaction: processor.transaction,
    });
    return rec ? rec.toJSON() : { id: approval.dataKey };
  }

  // Node reached an outcome (at run time or via action aggregation): finalize job + route.
  async decideAndRoute(node, processor, approval, job, { status, auto, empty }) {
    // official auto-empty payload (SIMA11): { status: 4 (approval APPROVED),
    // data: business snapshot } — no records key, no auto/empty markers
    const outcome = empty ? 4 : status;
    const snapshot = approval ? await this.snapshotBusinessData(this.workflow.app, approval, processor) : null;
    job.set({ result: { status: outcome, data: snapshot } });
    return this.route(node, job, processor);
  }

  // Route after a decision recorded in job.result.status.
  async route(node, job, processor) {
    let outcome = job.result?.status;
    const config = node.config ?? {};
    // auto-empty approvals end APPROVED (approval status 4, SIMA11 wire) —
    // normalize to the record-space outcome for routing
    if (Number(outcome) === 4) outcome = RECORD_STATUS.APPROVED;

    if (outcome === RECORD_STATUS.RETURNED) {
      if (config.branchMode) {
        const branch = processor.getBranches(node).find((b) => b.branchIndex === BRANCH_INDEX.RETURNED);
        if (branch) {
          await processor.run(branch, job);
          const last = processor.findBranchLastJob(branch, job);
          if (last && last.status === JOB_STATUS.PENDING) {
            return null; // branch paused on a nested pending node
          }
        }
      }
      job.set({ status: JOB_STATUS.RETRY_NEEDED }); // execution -6 → approval RETURNED (probe T3)
      processor.saveJob(job);
      return job;
    }

    if (outcome === RECORD_STATUS.REJECTED) {
      if (config.branchMode) {
        const branch = processor.getBranches(node).find((b) => b.branchIndex === BRANCH_INDEX.REJECTED);
        if (branch) {
          await processor.run(branch, job);
          const last = processor.findBranchLastJob(branch, job);
          if (last && last.status === JOB_STATUS.PENDING) {
            return null;
          }
        }
        if (config.endOnReject) {
          // SIMA10 wire: end-on-reject writes REJECTED(-5) like straight mode
          job.set({ status: JOB_STATUS.REJECTED });
          processor.saveJob(job);
          return job;
        }
      }
      // Straight mode (and post-branch fallthrough): job REJECTED(-5) is a terminal
      // status for the engine (Processor.StatusMap) — execution ends -5 and the main
      // line stops. Forcing RESOLVED here made L1 rejects flow into L2 (story #2,
      // 2026-10-22); official wire evidence writes core job -5 on reject
      // (index.js onRecordActed comment).
      job.set({ status: JOB_STATUS.REJECTED });
      processor.saveJob(job);
      return job;
    }

    // APPROVED
    if (config.branchMode) {
      const branch = processor.getBranches(node).find((b) => b.branchIndex === BRANCH_INDEX.APPROVED);
      if (branch) {
        await processor.run(branch, job);
        const last = processor.findBranchLastJob(branch, job);
        if (last && last.status === JOB_STATUS.PENDING) {
          return null; // paused at nested approval; its recall will continue
        }
      }
    }
    job.set({ status: JOB_STATUS.RESOLVED });
    processor.saveJob(job);
    return job;
  }

  async resume(node, job, processor) {
    if (String(job.nodeId) !== String(node.id)) {
      // A node inside one of our branches recalled into this node. The branch may
      // have fully ended OR be waiting at a nested pending node — check the last job.
      const parent = processor.findBranchParentJob(job, node);
      if (!parent) return null;
      const config = node.config ?? {};
      const outcome = parent.result?.status;
      const branchIndex =
        outcome === RECORD_STATUS.APPROVED
          ? 2
          : outcome === RECORD_STATUS.REJECTED
            ? -1
            : outcome === RECORD_STATUS.RETURNED
              ? 1
              : null;
      if (branchIndex != null) {
        const branchStart = processor.getBranches(node).find((b) => b.branchIndex === branchIndex);
        if (branchStart) {
          const last = processor.findBranchLastJob(branchStart, parent);
          if (last && last.status === JOB_STATUS.PENDING) {
            return null; // branch still waiting on a nested pending node
          }
        }
      }
      if (outcome === RECORD_STATUS.APPROVED) {
        parent.set({ status: JOB_STATUS.RESOLVED });
        processor.saveJob(parent);
        return parent;
      }
      if (outcome === RECORD_STATUS.REJECTED) {
        parent.set({ status: config.endOnReject ? JOB_STATUS.FAILED : JOB_STATUS.RESOLVED });
        processor.saveJob(parent);
        return parent;
      }
      if (outcome === RECORD_STATUS.RETURNED) {
        parent.set({ status: JOB_STATUS.RETRY_NEEDED });
        processor.saveJob(parent);
        return parent;
      }
      return null;
    }

    // Action-driven resume (plugin.resume(job) after aggregation in the submit action).
    // A no-target return from the action layer rewrites result to {status:0,data}
    // (official payload contract) and carries the decision in job.status
    // RETRY_NEEDED instead — re-routing here would read 0 as APPROVED and finish
    // the approval instead of returning it to the applicant (browser sim S4,
    // 2026-10-23; the API matrix missed it — SIMA6 compared end states only).
    if (Number(job.get('status')) === JOB_STATUS.RETRY_NEEDED) {
      return job;
    }
    const outcome = job.result?.status;
    if (outcome == null) {
      return null; // still undecided (partial action in And/voting/sequential mode)
    }
    return this.route(node, job, processor);
  }

  async duplicate(config) {
    return config;
  }
}

module.exports = ApprovalInstruction;
