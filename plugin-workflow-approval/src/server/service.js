const { parseCollectionName, joinCollectionName } = require('@nocobase/data-source-manager/lib/utils');
const { APPROVAL_STATUS, RECORD_STATUS, RECORD_TYPE } = require('./constants');

function parseDS(collectionName) {
  return parseCollectionName(collectionName || '');
}

function getCollectionManager(app, collectionName) {
  const [dataSourceName, name] = parseDS(collectionName);
  const source = app.dataSourceManager.dataSources.get(dataSourceName || 'main');
  return { source, collectionName: name, collection: source?.collectionManager.getCollection(name) };
}

async function loadRecord(app, collectionName, dataKey, options = {}) {
  const { source, collectionName: name } = getCollectionManager(app, collectionName);
  if (!source || !name || dataKey == null) return null;
  const repo = source.collectionManager.getRepository(name);
  return repo.findOne({ ...options, filterByTk: dataKey, transaction: options.transaction });
}

async function createShellRecord(app, collectionName, transaction, createdById = null) {
  const { source, collectionName: name } = getCollectionManager(app, collectionName);
  const repo = source.collectionManager.getRepository(name);
  // official shell records carry the applicant as createdById/updatedById
  // (simulation matrix: job payload data.createdById=1; variable assignees
  // {{$context.data.createdById}} resolve against it — SIMA12). The collection
  // manager sanitizes createdById out of create values — write the FK through
  // the model after the insert.
  const shell = await repo.create({ values: {}, transaction });
  if (createdById != null && shell) {
    const id = shell.get('id') ?? shell.id;
    await repo.model.update(
      { createdById, updatedById: createdById },
      { where: { id }, transaction },
    );
    shell.set('createdById', createdById);
    shell.set('updatedById', createdById);
  }
  return shell;
}

async function writeRecordData(app, collectionName, dataKey, data, transaction) {
  const { source, collectionName: name } = getCollectionManager(app, collectionName);
  const repo = source.collectionManager.getRepository(name);
  return repo.update({ filterByTk: dataKey, values: data, transaction });
}

function isVariableString(v) {
  return typeof v === 'string' && v.startsWith('{{') && v.endsWith('}}');
}

// Resolve config.assignees groups into an ordered, de-duplicated list of user ids.
// Group forms (per official client): number | "{{$context.path}}" variable string | {filter: {...}} | array of these.
// Bare group values (client FilterDynamicComponent output) are also accepted:
//   {$and: [...]} compiled query syntax, or {logic, items} editor shape (converted below).
function groupItemToFilter(item) {
  if (item.filter) return item.filter;
  if (Array.isArray(item.$and) || Array.isArray(item.$or)) return item;
  if ((item.logic === '$and' || item.logic === '$or') && Array.isArray(item.items)) {
    const compiled = item.items
      .map((child) => {
        if (child && typeof child === 'object' && (child.logic === '$and' || child.logic === '$or') && Array.isArray(child.items)) {
          const nested = groupItemToFilter(child);
          return nested && Object.keys(nested).length ? nested : null;
        }
        const { path, operator, value, ...rest } = child ?? {};
        if (typeof path !== 'string' || typeof operator !== 'string') return null;
        return path.split('.').reduceRight((acc, key) => ({ [key]: acc }), { [operator]: value, ...rest });
      })
      .filter(Boolean);
    return compiled.length ? { [item.logic]: compiled } : null;
  }
  return null;
}

// {$and:[{$and:[{id:{$eq:4}}]}]} (query-syntax group) -> {id:{$eq:4}}
// The repository's own filter parser expects field conditions; nested logical
// operators as VALUES (not parsed keys) are ignored, silently dropping the WHERE.
function stripGroupOperators(node) {
  if (Array.isArray(node)) {
    return node.length === 1 ? stripGroupOperators(node[0]) : { $or: node.map(stripGroupOperators) };
  }
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length && keys.every((k) => k === '$and' || k === '$or')) {
      const groups = keys.flatMap((k) => node[k].map(stripGroupOperators));
      return groups.length === 1 ? groups[0] : { [keys[0]]: groups };
    }
    const out = {};
    for (const k of keys) out[k] = node[k];
    return out;
  }
  return node;
}

async function resolveAssignees(app, workflowPlugin, config, contextData, transaction) {
  const raw = config.assignees ?? [];
  const flat = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
  const ids = [];
  const seen = new Set();
  const push = (id) => {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      ids.push(n);
    }
  };
  for (const item of flat) {
    if (item == null || item === '') continue;
    if (typeof item === 'number') {
      push(item);
    } else if (typeof item === 'string') {
      if (isVariableString(item)) {
        // The host variable resolver can return junk for unregistered leaves
        // (raw template strings, []) — only accept entries that survive the
        // numeric push() validation; otherwise fall back to the simple parser.
        let resolved = null;
        try {
          resolved = await workflowPlugin.variable.resolve?.(item, { contextData, transaction });
        } catch (e) { /* fall through to the simple parser */ }
        const before = ids.length;
        if (Array.isArray(resolved)) resolved.forEach(push);
        else if (resolved != null) push(resolved);
        if (ids.length === before) {
          const fallback = parseVariableSimple(item, contextData);
          if (Array.isArray(fallback)) fallback.forEach(push);
          else if (fallback != null) push(fallback);
        }
      } else {
        push(item);
      }
    } else if (typeof item === 'object') {
      const filter = groupItemToFilter(item);
      if (!filter) continue;
      // app.db repo on $and-wrapped group filters returns unfiltered rows in-process
      // (the HTTP layer pre-parses the JSON filter; the direct repo call does not),
      // so normalize to the plain nested-object filter shape that the repository's
      // own parser handles correctly: {$and:[{$and:[..]}]} -> {and:[{and:[..]}]}-style
      // is NOT it either — strip the outer operator wrappers down to field conditions.
      const normalized = stripGroupOperators(filter);
      // 本环境（lm fork alpha.9）进程内 repo.find 的 JSON filter 通道失效（任何 $and 包裹/字段
      // filter 均静默返回全表；HTTP 层因另有 parseFilter 预处理而正常，raw model.findAll(解析产物) 也
      // 正常）。因此这里自行 parseFilter → model.findAll，绕开失效通道，顺带兼容三种输入形态：
      // 官方编译格式 {$and:[...]} / 编辑器格式 {logic,items} / 官方旧 {filter:{...}} 包装。
      const repo = app.db.getRepository('users');
      const model = app.db.getCollection('users').model;
      const parsed = repo.parseFilter(stripGroupOperators(normalized), { context: undefined });
      const rows = await model.findAll({
        where: parsed?.where,
        include: parsed?.include,
        attributes: ['id'],
        limit: 1000,
        ...(transaction ? { transaction } : {}),
      });
      rows.forEach((r) => push(r.get ? r.get('id') : r.id));
    }
  }
  return ids;
}

// Minimal "{{$a.b.c}}" resolver against the trigger context data.
function parseVariableSimple(expr, contextData) {
  const m = /^\{\{\s*\$?context\.data\.([\w.]+)\s*\}\}$/.exec(expr);
  if (!m) return null;
  let v = contextData;
  for (const part of m[1].split('.')) {
    v = v?.[part];
    if (v == null) return null;
  }
  return v;
}

function getNegotiation(config) {
  const n = config.negotiation;
  if (typeof n === 'number' && n > 0 && n < 1) return { type: 'voting', ratio: n };
  if (n === 1) return { type: 'and' };
  return { type: 'or' };
}

// Aggregate record statuses into a node decision.
// Returns { status: RECORD_STATUS-like outcome, done } where done=true means node reached an outcome.
// outcome: 2 approved, -1 rejected, 1 returned (returned handled by caller before this).
function aggregateDecision(records, config) {
  const active = records.filter((r) => r.type !== RECORD_TYPE.DELEGATED || true);
  const acted = active.filter((r) => r.status !== RECORD_STATUS.PENDING && r.status !== RECORD_STATUS.ASSIGNED);
  const decides = active.filter((r) => [RECORD_STATUS.PENDING, RECORD_STATUS.ASSIGNED].includes(r.status));
  const approved = active.filter((r) => r.status === RECORD_STATUS.APPROVED).length;
  const rejected = active.filter((r) => r.status === RECORD_STATUS.REJECTED).length;
  const returned = active.filter((r) => r.status === RECORD_STATUS.RETURNED).length;
  const total = active.length;
  const { type, ratio } = getNegotiation(config);

  if (returned > 0) {
    return { outcome: RECORD_STATUS.RETURNED, done: true };
  }
  if (total === 0) {
    // empty assignees: node auto-passes (probe P-F)
    return { outcome: RECORD_STATUS.APPROVED, done: true };
  }
  if (type === 'or') {
    if (approved > 0) return { outcome: RECORD_STATUS.APPROVED, done: true, passed: [RECORD_STATUS.PENDING, RECORD_STATUS.PASSED] };
    if (decides.length === 0) return { outcome: RECORD_STATUS.REJECTED, done: true };
    return { outcome: null, done: false };
  }
  if (type === 'and') {
    if (rejected > 0) return { outcome: RECORD_STATUS.REJECTED, done: true };
    if (decides.length === 0) return { outcome: RECORD_STATUS.APPROVED, done: true };
    return { outcome: null, done: false };
  }
  // voting: pass ratio > ratio among ALL assignees
  if (approved / total > ratio) return { outcome: RECORD_STATUS.APPROVED, done: true };
  if (decides.length === 0) return { outcome: RECORD_STATUS.REJECTED, done: true };
  return { outcome: null, done: false };
}

// For sequential mode: mark records after the current actor as ASSIGNED and the actor PENDING.
function applySequentialGating(records) {
  const sorted = [...records].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  let opened = false;
  for (const r of sorted) {
    const st = r.status;
    const acted = st !== RECORD_STATUS.PENDING && st !== RECORD_STATUS.ASSIGNED;
    if (!acted && !opened) {
      opened = true;
      if (st === RECORD_STATUS.ASSIGNED) r.status = RECORD_STATUS.PENDING;
    } else if (!acted) {
      r.status = RECORD_STATUS.ASSIGNED;
    }
  }
}

// When node decided early, stamp the remaining pending records.
// alpha.12 wire (simulation matrix SIMA1, docs/13): on ANY resolution — approve
// included — non-acting assignees end UNPROCESSED(3). (The old "approve keeps
// PENDING(0)" observation came from the pre-alpha.12 demo and is superseded by
// the living oracle; undecided nodes never stamp, so partial votes/counts keep 0.)
function stampRemainders(records, outcome) {
  for (const r of records) {
    if (r.status === RECORD_STATUS.PENDING || r.status === RECORD_STATUS.ASSIGNED) {
      r.status = RECORD_STATUS.UNPROCESSED;
    }
  }
}

module.exports = {
  parseDS,
  getCollectionManager,
  loadRecord,
  createShellRecord,
  writeRecordData,
  resolveAssignees,
  parseVariableSimple,
  getNegotiation,
  aggregateDecision,
  applySequentialGating,
  stampRemainders,
  APPROVAL_STATUS,
  RECORD_STATUS,
  RECORD_TYPE,
};
