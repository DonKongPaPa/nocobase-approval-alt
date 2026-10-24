const { APPROVAL_STATUS, RECORD_STATUS, RECORD_TYPE, JOB_STATUS } = require('./constants');
const {
  parseDS,
  getCollectionManager,
  loadRecord,
  createShellRecord,
  writeRecordData,
  aggregateDecision,
  stampRemainders,
  getNegotiation,
} = require('./service');

const SUBMITTABLE = [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.RETURNED];

// Create a new approval round and trigger the workflow execution.
// Async triggers don't return the execution id — the instruction binds it on first run.
async function startRound(plugin, approval, { transaction } = {}) {
  const db = plugin.app.db;
  const RoundRepo = db.getRepository('approvalExecutions');
  const round = await RoundRepo.create({
    values: {
      approvalId: approval.id,
      executionId: null,
      status: null,
      snapshot: approval.data,
    },
    transaction,
  });
  await db.getRepository('approvals').update({
    filterByTk: approval.id,
    values: { latestExecutionId: round.id },
    transaction,
  });
  approval.latestExecutionId = round.id;
  const workflowPlugin = plugin.app.pm.get('@nocobase/plugin-workflow');
  const workflow = await db.getRepository('workflows').findOne({
    filterByTk: approval.workflowId,
    transaction,
  });
  if (!workflow) {
    throw new Error('Workflow not found');
  }
  const context = {
    data: { ...(approval.data ?? {}), id: approval.dataKey },
    approvalId: approval.id,
    approvalRoundId: round.id,
  };
  workflowPlugin.trigger(workflow, context, { transaction });
  return { round };
}

// 批14：转签/加签产生的新 PENDING 任务补发 todo 通知。官方 sendTodo 只在节点运行
// 与顺序模式放行时触发（instruction.js / index.js:211），delegate/add 直接建记录
// 不在其覆盖内，新审批人会静默漏信。
async function sendTodoForNewRecords(plugin, record, newRecords) {
  try {
    const db = plugin.app.db;
    const node = await db.getRepository('flow_nodes').findOne({
      filterByTk: record.get('nodeId'),
    });
    const workflow = await db.getRepository('workflows').findOne({
      filterByTk: record.get('workflowId'),
    });
    const approval = await db.getRepository('approvals').findOne({
      filterByTk: record.get('approvalId'),
    });
    await plugin.notifications.sendTodo(node, workflow?.title, approval, newRecords);
  } catch (e) {
    plugin.app.logger.warn(`[approval] reassign todo notification failed: ${e.message}`);
  }
}

// ---------------------------------------------------------------- approvals

const approvalsActions = {
  async create(ctx, next) {
    const { currentUser, currentRole } = ctx.state;
    const values = ctx.action.params.values ?? {};
    const { collectionName, data = {}, status = APPROVAL_STATUS.DRAFT, workflowId, dataKey } = values;
    if (!collectionName || !workflowId) {
      ctx.throw(400, 'collectionName and workflowId are required');
    }
    const db = ctx.app.db;
    const plugin = ctx.app.pm.get('workflow-approval');
    const workflow = await db.getRepository('workflows').findOne({ filterByTk: workflowId });
    if (!workflow || workflow.type !== 'approval') {
      ctx.throw(400, 'Invalid approval workflow');
    }
    if (!workflow.enabled && status === APPROVAL_STATUS.SUBMITTED) {
      ctx.throw(400, 'Workflow is not enabled');
    }

    let finalDataKey = dataKey ?? null;
    let snapshot = null;
    if ((workflow.config?.mode ?? 0) === 0 && finalDataKey == null) {
      // mode 0 (before save): the create-form submission itself creates the business
      // record with the submitted values (official demo shows record values while
      // status is still SUBMITTED); final approval may re-write approver-adjusted data
      const shell = await createShellRecord(ctx.app, collectionName, null, currentUser?.id ?? null);
      finalDataKey = String(shell.get('id') ?? shell.id);
      if (data && typeof data === 'object' && Object.keys(data).length) {
        await writeRecordData(ctx.app, collectionName, finalDataKey, data, null);
      }
      const fresh = await loadRecord(ctx.app, collectionName, finalDataKey);
      snapshot = fresh ? fresh.toJSON() : { id: finalDataKey };
    } else if (finalDataKey != null) {
      const rec = await loadRecord(ctx.app, collectionName, finalDataKey);
      snapshot = rec ? rec.toJSON() : { id: finalDataKey };
    } else {
      snapshot = data;
    }

    const approval = await db.getRepository('approvals').create({
      values: {
        collectionName,
        dataKey: finalDataKey,
        workflowId: workflow.id,
        workflowKey: workflow.key,
        status: Number(status),
        data: snapshot,
        action: { values, actionName: 'create', resourceName: 'approvals' },
        applicantRoleName: currentRole ?? null,
        createdById: currentUser?.id ?? null,
        updatedById: currentUser?.id ?? null,
      },
    });

    if (Number(status) === APPROVAL_STATUS.SUBMITTED) {
      const { executionId } = await startRound(plugin, approval);
      approval.latestExecutionId = executionId;
    }
    ctx.body = approval;
    await next();
  },

  async update(ctx, next) {
    const { currentUser } = ctx.state;
    const filterByTk = ctx.action.params.filterByTk;
    const values = ctx.action.params.values ?? {};
    const db = ctx.app.db;
    const plugin = ctx.app.pm.get('workflow-approval');
    const approval = await db.getRepository('approvals').findOne({ filterByTk });
    if (!approval) ctx.throw(404, 'Approval not found');
    if (Number(approval.createdById) !== Number(currentUser?.id)) {
      ctx.throw(403, 'Only the original applicant can resubmit the approval.');
    }
    if (!SUBMITTABLE.includes(Number(approval.status))) {
      ctx.throw(403, 'Only draft or returned approvals can be resubmitted.');
    }
    const newStatus = values.status ?? APPROVAL_STATUS.SUBMITTED;
    // Resubmit persists the edited fields into the BUSINESS record — official's
    // round-2 job snapshot shows the same dataKey with the updated values
    // (SIMA6 wire: same id 123, new title). Only the approval row would leave
    // the new round's dataBefore stale.
    if (values.data && typeof values.data === 'object' && approval.collectionName && approval.dataKey != null) {
      const { id, ...fields } = values.data;
      if (Object.keys(fields).length) {
        // raw model update: the repository JSON-filter channel is unreliable on
        // this fork (docs quirk) and update-by-pk needs no filter parsing
        await db.getRepository(approval.collectionName).model.update(fields, {
          where: { id: approval.dataKey },
        });
      }
    }
    await db.getRepository('approvals').update({
      filterByTk: approval.id,
      values: {
        data: values.data ?? approval.data,
        status: Number(newStatus),
        updatedById: currentUser?.id ?? null,
        action: { values, actionName: 'update', resourceName: 'approvals' },
      },
    });
    approval.set({ data: values.data ?? approval.data, status: Number(newStatus) });
    if (Number(newStatus) === APPROVAL_STATUS.SUBMITTED) {
      const { executionId } = await startRound(plugin, approval);
      approval.latestExecutionId = executionId;
    }
    ctx.body = approval;
    await next();
  },

  async destroy(ctx, next) {
    const { currentUser } = ctx.state;
    const filterByTk = ctx.action.params.filterByTk;
    const db = ctx.app.db;
    const approval = await db.getRepository('approvals').findOne({ filterByTk });
    if (!approval) ctx.throw(404, 'Approval not found');
    if (Number(approval.createdById) !== Number(currentUser?.id)) {
      ctx.throw(403, 'Only the original applicant can delete the approval.');
    }
    if (Number(approval.status) !== APPROVAL_STATUS.DRAFT) {
      ctx.throw(400, 'Only draft approvals can be deleted.');
    }
    await db.getRepository('approvalRecords').destroy({ filter: { approvalId: approval.id } });
    await db.getRepository('approvalExecutions').destroy({ filter: { approvalId: approval.id } });
    await db.getRepository('approvals').destroy({ filterByTk: approval.id });
    ctx.body = null;
    await next();
  },

  async withdraw(ctx, next) {
    const { currentUser } = ctx.state;
    const filterByTk = ctx.action.params.filterByTk;
    const values = ctx.action.params.values ?? {};
    const db = ctx.app.db;
    const approval = await db.getRepository('approvals').findOne({ filterByTk });
    if (!approval) ctx.throw(404, 'Approval not found');
    if (Number(approval.createdById) !== Number(currentUser?.id)) {
      ctx.throw(403, 'Only the original applicant can withdraw the approval.');
    }
    const workflow = await db.getRepository('workflows').findOne({ filterByTk: approval.workflowId });
    if (!workflow?.config?.withdrawable) {
      ctx.throw(400, 'This approval cannot be withdrawn.');
    }
    if (Number(approval.status) !== APPROVAL_STATUS.SUBMITTED) {
      ctx.throw(400, 'This approval cannot be withdrawn.');
    }
    // back to draft; round CANCELED(-4). alpha.12 (SIMA7 wire): open records are
    // DELETED (default list and explicit status=-2 filter both come back empty),
    // and the core job ends -4 with an emptied payload.
    const round = await db.getRepository('approvalExecutions').findOne({
      filterByTk: approval.latestExecutionId,
    });
    await db.getRepository('approvalRecords').destroy({
      filter: {
        approvalId: approval.id,
        approvalExecutionId: approval.latestExecutionId,
        status: { $in: [RECORD_STATUS.PENDING, RECORD_STATUS.ASSIGNED] },
      },
    });
    if (round?.get('executionId')) {
      const execJobs = await db.getRepository('jobs').find({
        filter: { executionId: round.get('executionId') },
      });
      const { loadRecord } = require('./service');
      const rec = await loadRecord(db.app ?? ctx.app, approval.collectionName, approval.dataKey);
      for (const j of execJobs) {
        j.set({
          status: -4,
          result: { status: 0, data: rec ? rec.toJSON() : { id: approval.dataKey }, records: [] },
        });
        j.changed('result', true);
        await j.save();
      }
      await db.getRepository('executions').update({
        filterByTk: round.get('executionId'),
        values: { status: -4, reason: 'withdrawn' },
      });
    }
    if (round) {
      await db.getRepository('approvalExecutions').update({
        filterByTk: round.id,
        values: { status: -4, reason: 'withdrawn' },
      });
    }
    await db.getRepository('approvals').update({
      filterByTk: approval.id,
      values: {
        status: APPROVAL_STATUS.DRAFT,
        data: values.data ? { ...(approval.data ?? {}), ...values.data } : approval.data,
        updatedById: currentUser?.id ?? null,
      },
    });
    const fresh = await db.getRepository('approvals').findOne({ filterByTk: approval.id });
    ctx.body = fresh;
    await next();
  },

  async get(ctx, next) {
    const filterByTk = ctx.action.params.filterByTk;
    const db = ctx.app.db;
    // official module 3557 appends (`Z`) — the approval timeline reads
    // rounds/records.job/records.node/records.user/latestRound.execution.jobs
    const appends = ctx.action.params.appends ?? [
      'createdBy',
      'records',
      'records.job',
      'records.node',
      'records.user',
      'rounds',
      'workflow.title',
      'workflow.nodes',
      'latestRound',
      'latestRound.execution',
      'latestRound.execution.jobs',
    ];
    const approval = await db.getRepository('approvals').findOne({
      filterByTk,
      appends,
    });
    if (!approval) ctx.throw(404, 'Approval not found');
    const workflow = await db.getRepository('workflows').findOne({
      filterByTk: approval.workflowId,
      appends: ['nodes'],
    });
    const json = approval.toJSON();
    json.workflow = workflow?.toJSON() ?? null;
    ctx.body = json;
    await next();
  },

  async listMine(ctx, next) {
    const { currentUser } = ctx.state;
    const options = { ...ctx.action.params, ...(ctx.action.params.values ?? {}) };
    const filter = {
      createdById: currentUser?.id,
      ...(options.filter ? safeParse(options.filter) : {}),
    };
    const rows = await ctx.app.db.getRepository('approvals').find({
      ...options,
      filter,
      appends: options.appends ?? [],
    });
    ctx.body = rows;
    await next();
  },

  // Related approvals: every approval raised from the same business record
  // (v2 client RelatedApprovalsModel contract: filter {dataKey, collectionName}).
  async listRelated(ctx, next) {
    const options = { ...ctx.action.params, ...(ctx.action.params.values ?? {}) };
    const filter = safeParse(options.filter);
    if (filter.dataKey == null || !filter.collectionName) {
      ctx.throw(400, 'listRelated requires dataKey and collectionName');
    }
    const rows = await ctx.app.db.getRepository('approvals').find({
      ...options,
      filter,
      appends: options.appends ?? [],
    });
    ctx.body = rows;
    await next();
  },
};

// ---------------------------------------------------------- approvalRecords

function safeParse(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try {
    return JSON.parse(s);
  } catch (e) {
    return {};
  }
}

async function decorateRecord(ctx, record) {
  const db = ctx.app.db;
  const json = record.toJSON();
  json.approvalExecution = (await db.getRepository('approvalExecutions').findOne({ filterByTk: record.get('approvalExecutionId') }))?.toJSON() ?? null;
  json.node = (await db.getRepository('flow_nodes').findOne({ filterByTk: record.get('nodeId') }))?.toJSON() ?? null;
  json.workflow = (await db.getRepository('workflows').findOne({
    filterByTk: record.get('workflowId'),
    appends: ['nodes'],
  }))?.toJSON() ?? null;
  json.execution = (await db.getRepository('executions').findOne({
    filterByTk: record.get('executionId'),
    except: ['context', 'output'],
  }))?.toJSON() ?? null;
  json.job = (await db.getRepository('jobs').findOne({ filterByTk: record.get('jobId') }))?.toJSON() ?? null;
  json.user = (await db.getRepository('users').findOne({ filterByTk: record.get('userId') }))?.toJSON() ?? null;
  // official module 3557 appends (`ee`) projected onto the nested approval:
  // the timeline needs records.job/node/user + latestRound.execution.jobs
  const approval = await db.getRepository('approvals').findOne({
    filterByTk: record.get('approvalId'),
    appends: [
      'createdBy',
      'rounds',
      'latestRound',
      'latestRound.execution',
      'latestRound.execution.jobs',
      'records',
      'records.job',
      'records.node',
      'records.user',
      'workflow',
      'workflow.nodes',
    ],
  });
  if (approval) {
    json.approval = approval.toJSON();
    // the official server decorates record.workflow; keep it for client parity
    json.workflow = json.workflow ?? json.approval?.workflow ?? null;
  } else {
    json.approval = null;
  }
  return json;
}

async function resolveAssigneeCandidates(ctx, record, type, searchFilter) {
  const db = ctx.app.db;
  const node = await db.getRepository('flow_nodes').findOne({ filterByTk: record.get('nodeId') });
  const scopeKey = type === 'toAdd' ? 'toAddReassignees' : 'toDelegateReassignees';
  // 兜底：UsersSelect 单选会写裸数字/字符串（非数组）——统一数组化再遍历
  const rawScope = node?.config?.[scopeKey] ?? [];
  const scope = Array.isArray(rawScope) ? rawScope : rawScope != null ? [rawScope] : [];
  const ids = new Set();
  for (const item of scope) {
    if (typeof item === 'number') ids.add(item);
    else if (typeof item === 'string' && /^\d+$/.test(item)) ids.add(Number(item));
    else if (item && typeof item === 'object') {
      // 三态：{filter:{...}}（assignees 存储形态）/ 裸编译组 {$and:[...]}（官方
      // FilterDynamicComponent onChange 输出）/ 其他对象兜底为 filter 值
      const group = item.filter && typeof item.filter === 'object' ? item.filter
        : (item.$and || item.$or) ? item
        : item;
      try {
        // ⚠ NocoBase repository.find 的字段选项是 fields 而非 attributes——
        // 传 attributes（未知选项）会让 filter 退化全表（实测 2026-10-22，
        // debug 铁证：同 filter 去 attributes 后结果正确）
        const rows = await db.getRepository('users').find({
          filter: group,
          fields: ['id'],
          limit: 1000,
        });
        rows.forEach((r) => ids.add(r.id));
      } catch (e) {
        // 非法组不炸整个候选人接口（留空/异常时该组不贡献候选人）
      }
    }
  }
  const filter = { id: { $in: Array.from(ids) } };
  if (searchFilter?.nickname?.$includes) filter.nickname = { $includes: searchFilter.nickname.$includes };
  if (searchFilter?.username?.$includes) filter.username = { $includes: searchFilter.username.$includes };
  const rows = await db.getRepository('users').find({ filter, pageSize: 200 });
  return rows.map((r) => r.toJSON());
}

const approvalRecordsActions = {
  async get(ctx, next) {
    const filterByTk = ctx.action.params.filterByTk;
    const record = await ctx.app.db.getRepository('approvalRecords').findOne({ filterByTk });
    if (!record) ctx.throw(404, 'Approval record not found');
    ctx.body = await decorateRecord(ctx, record);
    await next();
  },

  async listMine(ctx, next) {
    const { currentUser } = ctx.state;
    const options = { ...ctx.action.params, ...(ctx.action.params.values ?? {}) };
    const userFilter = safeParse(options.filter);
    const filter = {
      userId: currentUser?.id,
      ...userFilter,
    };
    const rows = await ctx.app.db.getRepository('approvalRecords').find({
      ...options,
      filter,
      appends: options.appends ?? ['approval'],
    });
    ctx.body = rows;
    await next();
  },

  async submit(ctx, next) {
    const { currentUser } = ctx.state;
    const filterByTk = ctx.action.params.filterByTk;
    const values = ctx.action.params.values ?? {};
    const db = ctx.app.db;
    const plugin = ctx.app.pm.get('workflow-approval');
    const record = await db.getRepository('approvalRecords').findOne({ filterByTk });
    if (!record || Number(record.get('userId')) !== Number(currentUser?.id)) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    if (Number(record.get('status')) !== RECORD_STATUS.PENDING) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    const status = Number(values.status);
    if (![RECORD_STATUS.APPROVED, RECORD_STATUS.REJECTED].includes(status)) {
      ctx.throw(400, 'Invalid status.');
    }
    await db.getRepository('approvalRecords').update({
      filterByTk: record.id,
      values: {
        status,
        comment: values.comment ?? null,
        dataAfter: values.data ?? null,
      },
    });
    record.set({ status, comment: values.comment ?? null });
    await plugin.onRecordActed(record, values.data ?? {});
    ctx.body = record;
    ctx.status = 202;
    await next();
  },

  async return(ctx, next) {
    const { currentUser } = ctx.state;
    const filterByTk = ctx.action.params.filterByTk;
    const values = ctx.action.params.values ?? {};
    const db = ctx.app.db;
    const plugin = ctx.app.pm.get('workflow-approval');
    const record = await db.getRepository('approvalRecords').findOne({ filterByTk });
    if (!record || Number(record.get('userId')) !== Number(currentUser?.id)) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    if (Number(record.get('status')) !== RECORD_STATUS.PENDING) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    // Store the comment AS SUBMITTED — official echoes the raw value into the
    // job payload (SIMA6 wire: plain string stays a plain string); the {text}
    // object form is the caller's choice, not a server normalization.
    const comment = values.comment ?? null;
    await db.getRepository('approvalRecords').update({
      filterByTk: record.id,
      values: {
        status: RECORD_STATUS.RETURNED,
        comment,
        returnToNodeKey: values.returnToNodeKey ?? null,
        dataAfter: values.data ?? null,
      },
    });
    record.set({ status: RECORD_STATUS.RETURNED, comment, returnToNodeKey: values.returnToNodeKey ?? null });

    const returnToNodeKey = values.returnToNodeKey;
    if (returnToNodeKey && returnToNodeKey !== '0') {
      // probe P-E: re-run the flow from the target node within the SAME round (engine rerun)
      const ok = await plugin.returnToNode(ctx, record, returnToNodeKey, values.data ?? {});
      if (ok) {
        ctx.status = 202;
        ctx.body = record;
        await next();
        return;
      }
      ctx.throw(400, 'returnToNodeKey must be one of the configured return nodes.');
    }
    await plugin.onRecordActed(record, values.data ?? {}, { returned: true });
    ctx.status = 202;
    ctx.body = record;
    await next();
  },

  async delegate(ctx, next) {
    const { currentUser } = ctx.state;
    const filterByTk = ctx.action.params.filterByTk;
    const values = ctx.action.params.values ?? {};
    const db = ctx.app.db;
    const plugin = ctx.app.pm.get('workflow-approval');
    const record = await db.getRepository('approvalRecords').findOne({ filterByTk });
    if (!record || Number(record.get('userId')) !== Number(currentUser?.id)) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    if (Number(record.get('status')) !== RECORD_STATUS.PENDING) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    const assignee = Number(values.assignee);
    const candidates = await resolveAssigneeCandidates(ctx, record, 'toDelegate', {});
    if (!candidates.some((u) => Number(u.id) === assignee)) {
      ctx.throw(400, 'Assignee is invalid.');
    }
    // alpha.12 two-gate order (probe SIMA-D*): candidate list first, then the
    // node actions allowlist — 8 = delegate
    const dNode = await db.getRepository('flow_nodes').findOne({ filterByTk: record.get('nodeId') });
    if (!((dNode?.config?.actions ?? []).includes(8))) {
      ctx.throw(400, 'Delegate action is not allowed for this node.');
    }
    await db.getRepository('approvalRecords').update({
      filterByTk: record.id,
      values: { status: RECORD_STATUS.DELEGATED }, // probe T5
    });
    // undecided node — official rewrites the core job payload {status:0, data}
    // without records (SIMA8 wire)
    {
      const pluginP = ctx.app.pm.get('workflow-approval');
      const jobD = await pluginP.findJob(record.get('jobId'));
      const approvalD = await db.getRepository('approvals').findOne({ filterByTk: record.get('approvalId') });
      if (jobD && approvalD) {
        jobD.result = await pluginP.buildJobPayload(approvalD, 0);
        jobD.changed('result', true);
        await jobD.save();
      }
    }
    const newRecord = await db.getRepository('approvalRecords').create({
      values: {
        approvalId: record.get('approvalId'),
        approvalExecutionId: record.get('approvalExecutionId'),
        userId: assignee,
        jobId: record.get('jobId'),
        executionId: record.get('executionId'),
        nodeId: record.get('nodeId'),
        workflowId: record.get('workflowId'),
        index: (Number(record.get('index')) || 0) + 1,
        title: record.get('title'),
        status: RECORD_STATUS.PENDING,
        type: RECORD_TYPE.DELEGATED,
        prevRecordId: record.id,
        dataBefore: record.get('dataBefore'),
      },
    });
    await sendTodoForNewRecords(plugin, record, [newRecord]);
    record.set({ status: RECORD_STATUS.DELEGATED });
    await plugin.setProcessing(record);
    ctx.status = 202;
    ctx.body = null;
    await next();
  },

  async add(ctx, next) {
    const { currentUser } = ctx.state;
    const filterByTk = ctx.action.params.filterByTk;
    const values = ctx.action.params.values ?? {};
    const db = ctx.app.db;
    const plugin = ctx.app.pm.get('workflow-approval');
    const record = await db.getRepository('approvalRecords').findOne({ filterByTk });
    if (!record || Number(record.get('userId')) !== Number(currentUser?.id)) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    if (Number(record.get('status')) !== RECORD_STATUS.PENDING) {
      ctx.throw(403, 'You are not assigned to this approval.');
    }
    const assignees = Array.isArray(values.assignee) ? values.assignee : [values.assignee];
    const candidates = await resolveAssigneeCandidates(ctx, record, 'toAdd', {});
    const invalid = assignees.map(Number).filter((id) => !candidates.some((u) => Number(u.id) === id));
    if (invalid.length) {
      ctx.throw(400, 'Assignee is invalid.');
    }
    // alpha.12: node actions allowlist — 99 = add (probe SIMA-D5)
    const aNode = await db.getRepository('flow_nodes').findOne({ filterByTk: record.get('nodeId') });
    if (!((aNode?.config?.actions ?? []).includes(99))) {
      ctx.throw(400, 'Add action is not allowed for this node.');
    }
    const baseIndex = Number(record.get('index')) || 0;
    const before = values.order === -1;
    const added = before ? assignees.map(Number) : assignees.map(Number);
    // insert before/after me and reindex subsequent records (probe T6)
    const siblings = await db.getRepository('approvalRecords').find({
      filter: {
        approvalExecutionId: record.get('approvalExecutionId'),
        nodeId: record.get('nodeId'),
        status: { $in: [RECORD_STATUS.PENDING, RECORD_STATUS.ASSIGNED, RECORD_STATUS.APPROVED, RECORD_STATUS.REJECTED] },
      },
    });
    for (const s of siblings) {
      const idx = Number(s.get('index')) || 0;
      if (before && idx >= baseIndex) {
        await db.getRepository('approvalRecords').update({
          filterByTk: s.id,
          values: { index: idx + added.length },
        });
      } else if (!before && idx > baseIndex) {
        await db.getRepository('approvalRecords').update({
          filterByTk: s.id,
          values: { index: idx + added.length },
        });
      }
    }
    let i = 0;
    const addedRecords = [];
    for (const uid of added) {
      const addedRecord = await db.getRepository('approvalRecords').create({
        values: {
          approvalId: record.get('approvalId'),
          approvalExecutionId: record.get('approvalExecutionId'),
          userId: uid,
          jobId: record.get('jobId'),
          executionId: record.get('executionId'),
          nodeId: record.get('nodeId'),
          workflowId: record.get('workflowId'),
          index: before ? baseIndex + i : baseIndex + 1 + i,
          title: record.get('title'),
          status: RECORD_STATUS.PENDING,
          type: RECORD_TYPE.ADDED,
          prevRecordId: record.id,
          dataBefore: record.get('dataBefore'),
        },
      });
      addedRecords.push(addedRecord);
      i += 1;
    }
    await sendTodoForNewRecords(plugin, record, addedRecords);
    await plugin.setProcessing(record);
    ctx.status = 205;
    ctx.body = null;
    await next();
    // undecided node — official rewrites the core job payload {status:0, data}
    // without records (SIMA9 wire)
    {
      const pluginA = ctx.app.pm.get('workflow-approval');
      const jobA = await pluginA.findJob(record.get('jobId'));
      const approvalA = await db.getRepository('approvals').findOne({ filterByTk: record.get('approvalId') });
      if (jobA && approvalA) {
        jobA.result = await pluginA.buildJobPayload(approvalA, 0);
        jobA.changed('result', true);
        await jobA.save();
      }
    }

  },
};

const reassigneesActions = {
  async list(ctx, next) {
    const type = ctx.action.params.type ?? 'toAdd';
    const filter = safeParse(ctx.action.params.filter);
    // 嵌套资源 id 三态兼容：
    // - v3 slash 形态 /api/approvalRecords/<id>/reassignees:list → id 在 ctx.action.resourceOf/sourceId
    //   （resourcer.js: ctx.action.resourceOf = params.associatedIndex）
    // - 2.4 点号形态 /api/approvalRecords.reassignees/<id>:list → params.resourceOf
    // - v3 点号形态 → 被装配进 params.filterByTk（resourcer.js: params.filterByTk = params.resourceIndex）
    const recordId =
      ctx.action.params.filterByTk ??
      ctx.action.resourceOf ??
      ctx.action.sourceId ??
      ctx.action.params.resourceOf;
    const record = await ctx.app.db.getRepository('approvalRecords').findOne({
      filterByTk: recordId,
    });
    if (!record) {
      ctx.body = [];
      await next();
      return;
    }
    const rows = await resolveAssigneeCandidates(ctx, record, type, filter);
    ctx.body = rows;
    await next();
  },
};

// Official workflows:listApprovalFlows (task-center "Apply new" drawer source):
// centralized + enabled + current approval workflows, client sends filter/page/pageSize/sort.
async function listApprovalFlows(ctx, next) {
  const params = ctx.action.params ?? {};
  const userFilter = typeof params.filter === 'string' ? safeParse(params.filter) : params.filter;
  const base = { type: 'approval', enabled: true, current: true, 'config.centralized': true };
  const hasUser = userFilter && typeof userFilter === 'object' && Object.keys(userFilter).length > 0;
  const filter = hasUser ? { $and: [base, userFilter] } : base;
  const repo = ctx.db.getRepository('workflows');
  const sort = Array.isArray(params.sort) && params.sort.length ? params.sort : ['-createdAt'];
  const rows = await repo.find({
    filter,
    page: Math.max(1, Number(params.page) || 1),
    pageSize: Math.max(1, Number(params.pageSize) || 20),
    sort,
  });
  const count = await repo.count({ filter });
  // data-wrapping middleware turns {rows, ...rest} into {data, meta:{...rest}}
  ctx.body = { rows: rows.map((r) => r.toJSON()), count };
  await next();
}

module.exports = { approvalsActions, approvalRecordsActions, reassigneesActions, startRound, safeParse, listApprovalFlows };
