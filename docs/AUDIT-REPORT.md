# 多 Agent 审计报告

> **审计时间**: 2026-04-05 ~ 2026-04-06
> **审计范围**: PR #2 全部 55 个文件
> **使用的审计 Agent**: 4 个

---

## Agent 1: 重复/边界/导入审计 (Explore Agent)

**任务**: 扫描所有 55 个文件，检查重复代码、边界错误、导入错误、不必要文件
**耗时**: ~5 分钟
**工具调用次数**: 119

### 发现的 CRITICAL 问题

#### 1. `SessionEntry` 类型导入不存在
- **文件**: `useMasterMonitor.ts:15`, `useSlaveNotifications.ts:17`
- **问题**: `import type { SessionEntry } from '../state/AppStateStore.js'` — AppStateStore 中不存在 `SessionEntry` 类型
- **修复**: 在 `useMasterMonitor.ts` 中本地定义 `SessionEntry` 类型，`useSlaveNotifications.ts` 从 `useMasterMonitor.js` 导入

#### 2. `pipeIpc` 字段未在 AppState 中声明
- **文件**: 10 个文件（usePipeIpc, useMasterRelay, useMasterMonitor, useSlaveNotifications, attach, detach, send, pipes, pipe-status, history）
- **问题**: `state.pipeIpc` 直接访问，但 AppState 类型中没有 `pipeIpc` 字段，运行时会崩溃
- **修复**: 在 `pipeTransport.ts` 中添加 `getPipeIpc()` 安全访问器，所有 30+ 处引用改用此函数

#### 3. 7 个非实现文件在 PR 中
- **文件**: `docs/CHANGES.md`, `docs/feature-flags-audit-complete.md`, `docs/partial-flags-implementation-plan.md`, `docs/pipe-master-slave-complete.md`, `docs/pipe-master-slave-design.md`, `test-pipe-ipc.ts`, `src/pipe-demo.ts`
- **修复**: 全部从 PR 中移除

### 其他发现

- **边界**: `attach.ts:79` stale closure read — `slaveCount` 从 pre-setAppState 快照计算，并发 attach 时可能不准确（低风险，已文档记录）
- **重复代码**: `src/assistant/gate.ts` vs `src/commands/assistant/gate.ts` — 确认为不同函数（`isKairosEnabled` async vs `isAssistantEnabled` sync），非重复
- **导入验证**: 所有本地导入和父目录导入均已验证，全部解析到现有文件

---

## Agent 2: 修改文件正确性检查 (Explore Agent)

**任务**: 检查 15 个修改文件的 diff，验证每个修改是否正确、是否必要、是否触碰了原始工作代码
**耗时**: ~8 分钟
**工具调用次数**: 191

### 发现的问题

| # | 文件 | 严重性 | 问题 | 处理 |
|---|------|--------|------|------|
| 1 | `ReviewArtifactPermissionRequest.tsx` | Medium | 拒绝路径中 `onDone()` 在 `onReject()` 和 `toolUseConfirm.onReject()` 之前调用 — 可能在副作用完成前卸载组件 | **已修复**: 重新排序为 `toolUseConfirm.onReject()` → `onReject()` → `onDone()` |
| 2 | `MonitorTool.ts` | Low-Med | `isReadOnly()` 返回 `true` 但工具执行任意 shell 命令 — 可能绕过权限检查 | **已修复**: 改为 `return false` |
| 3 | `WorkflowTool.ts` | High | `call()` 返回硬编码成功字符串 `"Executed workflow: ..."` 但实际未执行任何工作流 | **已修复**: 返回明确错误信息 |
| 4 | `createWorkflowCommand.ts` | Low | `getPromptForCommand(args)` 缺少 `PromptCommand` 接口要求的第二个 `context: ToolUseContext` 参数 | **已修复**: 添加 `_context` 参数 |
| 5 | `udsMessaging.ts` | Trivial | 死导入 `getSessionId` — 导入但从未使用 | **已修复**: 移除导入 |
| 6 | `MonitorMcpDetailDialog.tsx` | Low | 外层 `<Box>` 有 `borderStyle="round"` — 其他类似对话框没有此样式 | 保留 (cosmetic) |
| 7 | `WorkflowDetailDialog.tsx` | Low | `onDone` prop 接收但从未调用；`_onSkipAgent`/`_onRetryAgent` 标记未使用 | 保留 (placeholder) |

### 确认正确的实现

- **MonitorPermissionRequest**: 正确实现，与 `FallbackPermissionRequest` 模式一致
- **mcpSkills**: `memoizeWithLRU` 使用正确，MCP skill 发现实现完整
- **LocalWorkflowTask**: `generateTaskId('local_workflow')` 使用正确的 TaskType
- **MonitorMcpTask**: 与 LocalWorkflowTask 结构一致，`generateTaskId('monitor_mcp')` 正确
- **ReviewArtifactTool**: passthrough call() 正确（display-only tool）
- **udsClient**: 所有导入验证通过，`isPeerAlive` 实现合理

---

## Agent 3: CodeRabbit 自动审核 (GitHub Bot)

**触发**: PR #2 创建时自动运行
**发现**: 3 Critical + 1 Minor

| 评论 | 状态 | 修复 commit |
|------|------|------------|
| useMasterRelay listener 堆积 | Resolved | useRef + boundClientRef 模式 |
| LocalWorkflowTask skip/retry 空操作 | Resolved | pendingAgentAction 字段 |
| REPLTool call() 假成功 | Resolved | 返回错误信息 |
| useMasterRelay error 路径静默丢弃 | Resolved | 添加日志记录 |

---

## Agent 4: CLI 二进制证据提取 (Explore Agent)

**任务**: 从 CLI v2.1.92 二进制提取逆向工程证据
**结果**: 见 `EVIDENCE.md`

关键发现:
- `tool_use_single` (5 matches) — 确认 completionType 字符串
- `tengu_kairos` (6 matches) — 确认 KAIROS 功能存在
- `PROACTIVE` (5 matches) — 确认 PROACTIVE 特性标志
- `verify_plan` (3 matches) — 确认 VerifyPlanExecutionTool
- `repl_tool` (1 match) — 确认 REPLTool 存在
- `language_name:"none"` — 确认权限请求中的 language_name 字段值

---

## 总结

| 指标 | 数值 |
|------|------|
| 审计的文件总数 | 55 |
| 发现的问题总数 | 14 |
| 已修复的问题数 | 12 |
| 保留的低优先级问题 | 2 (cosmetic/placeholder) |
| 导入验证通过率 | 100% |
| 原始文件被修改数 | 0 |
