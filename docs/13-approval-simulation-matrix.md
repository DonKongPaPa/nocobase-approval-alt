# 13 — 审批插件仿真矩阵轮（tools/sim-approval-matrix.mjs，2026-10-23）

> 子流程插件的经验（docs/subworkflow 08 §8）迁移到审批插件：T1-T15 固定剧本全绿
> 不是终判。13 场景组合矩阵（SIMA1-13）双端对比（官方 demo <demo-host>
> alpha.12.20261022160115 vs 本地兼容实现 13800），**抓出 7 类真差异并全部修复**，
> 终判 **IDENTICAL（12 场景 MATCH + 1 登记偏差）**。

## 1. 参与方边界（探针实证）

- demo member 用户被多空间墙拦（approvalRecords 403）→ 多人协作的"第二执行方"在 demo 不可得
- **root 当审批人完全可执行**（202→APPROVED 探针）→ 矩阵以 root 为唯一执行方
- countersign 双票终态在 demo 不可观测 → 断言中间态（或签/投票的一票定局全可观）

## 2. 场景与修复（SIMA1-13）

| 场景 | 组合 | 官方行为 | 兼容实现修复 |
|---|---|---|---|
| SIMA1 | 或签 [root,sima] 一票定局 | 通过后**其余 record → 3 UNPROCESSED**（旧 demo 0 语义被 alpha.12 取代） | stampRemainders 全结果重打戳 |
| SIMA2/3/4 | countersign 中间态/顺序门控/**投票 1/2 vs 0.5** | 投票不达标停在 3（**T14 悬案闭环：阈值严格大于**） | 中间态 job payload 形态 |
| SIMA5/10 | 拒绝（直通/分支终局） | 核心 job+execution **-5**（分支 endOnReject 同样 -5，非 -1） | route() endOnReject 改 -5 |
| SIMA6 | 退回→重提新轮次 | 每轮独立 execution | （**2026-10-23 浏览器轮修正**：旧脚本把 status 1 POST 到 submit，兼容实现 400/官方自派——端态巧合假阳性；脚本已改走 `approvalRecords:return` + 中间态 approval=1 断言，抓出并修复 resume() 误路由，见 §6 / docs/10 §11.2） |
| SIMA7 | 撤回 | **records 删除**（列表与 -2 过滤均空）+ job -4 + 载荷 records:[] | destroy 替代 -2、job -4、载荷 |
| SIMA8/9 | 转签/加签 | **两级校验**：候选人名单（`Assignee is invalid.`）→ 节点 actions 白名单 8/99（`Delegate/Add action is not allowed for this node.`） | 补 8/99 门禁；场景修正 actions 配置 |
| SIMA11 | 编译格式 filter 组审批人 | **官方解析为空 → auto-approve 4 无 records**；兼容实现保留解析（用户要求的嵌套能力） | **登记 known deviation** |
| SIMA12 | 变量审批人 `{{$context.data.createdById}}` | 解析到申请人 | ①shell 记录补 createdById（model.update 直写 FK）②宿主 variable.resolve 返回 []/垃圾串时的**数值验证+兜底解析** |
| SIMA13 | 退回指定节点 | **原位复用**：record 重指目标节点 status 0、job 重置 0（无 RETURNED 残留、无 -6、无 rerun） | returnToNode 重写 |

## 3. 载荷契约（贯穿性发现）

官方 core job result 全程被重写为富载荷：

```
{ status: <动作 status / auto 时审批状态 4>,
  data: <业务记录全量快照 id/createdById/updatedById/title>,
  records: [{id,status,userId,comment}] — 仅节点出结果时携带,
  …updatedAt 仅出现在被重打戳的余票 record 上 }
```

兼容实现原 `{status, data:{}, _route}` 全形态废弃（`_route` 标记从 result 移除）。

## 4. 终判

- `tools/sim-approval-matrix.mjs --diff` → **IDENTICAL，totalDiffs=0**
- 12 场景 MATCH + SIMA11 登记偏差（官方 alpha.12 疑似回归：编译格式 filter 组
  解析为空；兼容实现保留用户要求的解析能力，不再跟随）
- 回归：CI smoke（建集合→会签→APPROVED）全绿
- 部署面：本轮同时修复了 13800 的**陈旧构建**问题（四个服务端文件与源码不一致）

## 6. 浏览器仿真轮增补（2026-10-23，第 8 类修复：无目标退回误路由）

docs/10 §11 的 v3 portal 三账号拟真仿真在 S4 抓到矩阵盲区：

- **现象**：`approvalRecords:return`（官方客户端退回端点，无 returnToNodeKey）后 approval 直接终态 4 APPROVED（应 1 RETURNED、execution -6）。
- **根因**：`onRecordActed` 无目标退回分支按官方契约把核心 job 重写 `{status:0,data}` + job=-6 后调 `plugin.resume(job)`；`ApprovalInstruction.resume` 只读 `result.status`=0 交给 `route()`，0 落 APPROVED 分支。
- **矩阵为何漏**：旧 SIMA6 把 status:1 POST 到 `approvalRecords:submit`（兼容实现 400、官方自派），脚本容错+后续重提让两端端态巧合收敛——**中间态没断言就没比过**。
- **修复**：resume() 对 action 层已置 RETRY_NEEDED 的 job 直接透传；SIMA6 脚本改走 `:return` + 中间态 approval=1 断言（断言不能带 `&fields=`——demo 的 approvals:get+fields 直接 500「Data source not found」，fields 怪癖又一形态）。
- **载荷补遗（官方首份无目标退回 wire 铁证）**：official 退回轮核心 job=-6 且 result={status:1, data, records:[退回 record]}——**决定态载荷**（同 approve/reject 形态）；兼容实现原写 {status:0,data} 是把 SIMA13 returnToNode 的重置形态错套到无目标退回上。已改 buildJobPayload(RETURNED, withRecords)。另：return action 的 comment 改**原样入库**（official 载荷 echo 原始值，字符串留字符串；{text} 是调用方形态不是服务端归一——submit 本就原样存）。再下一层：resubmit 需把 values.data 写回业务记录行（官方 round2 快照=同 dataKey+新 title；原实现只更新 approvals.data，新轮 dataBefore 快照残旧）。
- **复验**：v3 portal S4b 全链（提交→通过→退回→RETURNED→重提预填+第 2 轮→双批→APPROVED）+ 库级三断言（approval=1/execution=-6/job=-6）；最终构建矩阵回归与 CI round3/4 另录。
- **方法论沉淀**：矩阵断言必须覆盖**状态迁移链的每个中间态**，端态对比对「脚本会自行纠偏」的剧本天然不敏感。
