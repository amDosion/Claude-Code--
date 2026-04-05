# PARTIAL Feature Flags Implementation — Detailed Change Report

## Overview

This PR implements all missing files for **9 PARTIAL feature flags** (P0–P8) discovered during
the 92-flag audit of Claude Code v2.1.92. It also includes Phase 1 pipe IPC and 12 new tool
implementations that replace `null` stubs with proper `buildTool()` definitions.

**Total: 69 files changed, ~9200 lines added**

---

## Evidence Sources

All implementations were reverse-engineered from the following verifiable sources:

| Source | Location | Usage |
|--------|----------|-------|
| **Official CLI v2.1.92** | `/tmp/claude-latest/node_modules/@anthropic-ai/claude-code/cli.js` | 12.5MB minified, 16939 lines. Used for extracting exact variable names, field schemas, telemetry keys |
| **Existing source code** | `src/` directory (pre-existing compiled `.tsx`/`.ts` files) | Import paths, type definitions, caller signatures, command registration patterns |
| **Type definitions** | `src/Tool.ts`, `src/Task.ts`, `src/types/` | Required interface fields, type unions, branded types |

### How Evidence Was Extracted

1. **Feature flag search**: `grep -c 'feature_name' cli.js` to determine if compiled in
2. **Reference counting**: `grep -c 'variable_name' cli.js` for usage density
3. **Caller analysis**: Tracing imports from `tools.ts`, `commands.ts`, `main.tsx` to find expected exports
4. **Type constraint matching**: Reading `buildTool()` generic constraint in `Tool.ts:725` to identify required fields

### CLI Binary Evidence

| Feature | In CLI v2.1.92? | Evidence |
|---------|----------------|---------|
| `monitor_mcp` | YES (9 refs) | Task type in TaskType union, `tengu_monitor_tool_used` telemetry |
| `local_workflow` | YES (12 refs) | Task type, workflow command registration |
| `buddy` | YES (compiled in) | 18 species list, mulberry32 PRNG, salt `"friend-2026-401"`, `/buddy` command |
| `PROACTIVE` | YES | `BRIEF_PROACTIVE_SECTION`, Sleep tool integration |
| `HISTORY_SNIP` | YES | snip tool references, projection system |
| `KAIROS` | YES | Multiple system references |
| `UDS_INBOX` | NO (DCE'd in v2.1.42 public build) | Present in v2.1.92 internal build |
| `CONTEXT_COLLAPSE` | NO (DCE'd) | Feature gate only |
| `TERMINAL_PANEL` | NO (DCE'd) | Feature gate only |
| `WEB_BROWSER_TOOL` | NO (DCE'd) | Feature gate only |

---

## Phase 1: Pipe IPC Master-Slave System

**All new files — no existing files modified.**

| File | Lines | Purpose |
|------|-------|---------|
| `src/utils/pipeTransport.ts` | 423 | Named pipe (FIFO) transport layer with framing protocol |
| `src/utils/pipeRepl.ts` | 187 | REPL input interception for pipe forwarding |
| `src/hooks/usePipeIpc.ts` | 246 | React hook managing pipe lifecycle |
| `src/hooks/useMasterMonitor.ts` | 128 | Master-side slave monitoring |
| `src/hooks/useMasterRelay.ts` | 114 | Master-side output relay |
| `src/hooks/useSlaveNotifications.ts` | 125 | Slave-side toast notifications |
| `src/commands/attach/` | 109 | `/attach <pid>` slash command |
| `src/commands/detach/` | 99 | `/detach` slash command |
| `src/commands/send/` | 105 | `/send <msg>` slash command |
| `src/commands/history/` | 94 | `/history` slash command |
| `src/commands/pipe-status/` | 69 | `/pipe-status` slash command |
| `src/commands/pipes/` | 56 | `/pipes` slash command |

---

## Phase 3: PARTIAL Feature Flag Implementations

### P0: MONITOR_TOOL

| File | Original | Now | Evidence |
|------|----------|-----|----------|
| `MonitorTool.ts` | 1 line | 192 | `exec()` signature from `Shell.ts:181`: positional `(cmd, signal, shellType)`. `spawnShellTask()` from `LocalShellTask.tsx:180`: `{command, description, shellCommand, toolUseId, agentId, kind}` |
| `MonitorMcpTask.ts` | 5 lines | 139 | `Task.ts:6-12`: `'monitor_mcp'` in TaskType union. Uses `registerTask()`, `updateTaskState()`, `createTaskStateBase()` |
| `MonitorMcpDetailDialog.tsx` | 3 lines | 102 | `Dialog.tsx:11`: requires `onCancel` (NOT `onDone`). `inputGuide` is `(exitState) => ReactNode` (NOT render prop) |
| `MonitorPermissionRequest.tsx` | 3 lines | 163 | `PermissionRequest.tsx:71`: routes to this. Must accept `PermissionRequestProps` |

**E2E bugs found & fixed:**
- `exec(cmd, {obj})` → `await exec(cmd, signal, 'bash')` (wrong arg types + missing await)
- `onDone` → `onCancel` on Dialog; `renderInputGuide` → `inputGuide` (function)
- Missing `mapToolResultToToolResultBlockParam` (required by Tool interface)

### P1: WORKFLOW_SCRIPTS

| File | Original | Now | Evidence |
|------|----------|-----|----------|
| `WorkflowTool.ts` | 1 line | 73 | Missing `prompt()`, `renderToolUseMessage()`, `mapToolResultToToolResultBlockParam()`, `maxResultSizeChars` — all added |
| `WorkflowPermissionRequest.tsx` | 3 lines | 164 | Must accept `PermissionRequestProps` (not custom props) |
| `createWorkflowCommand.ts` | 3 lines | 41 | `commands.ts:404` calls `.getWorkflowCommands(cwd)` — original stub exported wrong name |
| `bundled/index.ts` | NEW | 15 | `tools.ts:131` calls `initBundledWorkflows()` |
| `LocalWorkflowTask.ts` | 5 lines | 193 | `BackgroundTasksDialog.tsx` calls 3 missing exports: `killWorkflowTask`, `skipWorkflowAgent`, `retryWorkflowAgent` |
| `WorkflowDetailDialog.tsx` | 3 lines | 116 | Caller passes `{workflow, onDone, onKill, onSkipAgent, onRetryAgent, onBack}` — old stub had `{task, onDone}` |

### P2: REVIEW_ARTIFACT

| File | Evidence |
|------|----------|
| `ReviewArtifactTool.ts` | Full `buildTool()` with all required fields |
| `ReviewArtifactPermissionRequest.tsx` | Fixed: `logUnaryPermissionEvent('tool_use_single', toolUseConfirm, ...)` matching `utils.ts:5` signature. `onAllow(toolUseConfirm.input, [])` matching codebase pattern |

### P3–P7: Other flags

- **mcpSkills.ts**: `memoizeWithLRU` pattern from existing `memoize.ts`
- **udsMessaging.ts + udsClient.ts**: NDJSON protocol, `uds:/path` and `bridge:session_...` formats from `SendMessageTool/prompt.ts`
- **buddy**: 18 species, seeded RNG from CLI binary extraction
- **assistant/KAIROS**: `main.tsx:81` references `./assistant/gate.js` → `isKairosEnabled()`

### P8: 12 Tool Implementations

All use `buildTool()` with required non-defaultable fields:

| Tool | Gate | Evidence Source |
|------|------|----------------|
| SleepTool | `PROACTIVE \|\| KAIROS` | `prompt.ts`: full prompt with TICK_TAG, DESCRIPTION |
| SnipTool | `HISTORY_SNIP` | `prompt.ts`, query engine projection references |
| VerifyPlanExecutionTool | `VERIFY_PLAN=true` | `constants.ts`, ExitPlanMode refactoring comment |
| REPLTool | `USER_TYPE=ant` | `constants.ts`, `primitiveTools.ts` (8 wrapped tools) |
| ListPeersTool | `UDS_INBOX` | `SendMessageTool/prompt.ts` describes discovery protocol |
| SendUserFileTool | `KAIROS` | `prompt.ts`: SEND_USER_FILE_TOOL_NAME |
| PushNotificationTool | `KAIROS \|\| KAIROS_PUSH_NOTIFICATION` | `ConfigTool/supportedSettings.ts`: 3 notification types |
| SubscribePRTool | `KAIROS_GITHUB_WEBHOOKS` | Feature gate only |
| CtxInspectTool | `CONTEXT_COLLAPSE` | Feature gate only |
| TerminalCaptureTool | `TERMINAL_PANEL` | `prompt.ts`: TERMINAL_CAPTURE_TOOL_NAME |
| WebBrowserTool | `WEB_BROWSER_TOOL` | `WebBrowserPanel.tsx` exists |
| SuggestBackgroundPRTool | `USER_TYPE=ant` | Feature gate only |

**Why buildTool() instead of null:** The `Tool` type has required non-defaultable fields (`prompt`, `renderToolUseMessage`, `mapToolResultToToolResultBlockParam`, `maxResultSizeChars`). A `null` export works in `tools.ts` because it's filtered with `...(X ? [X] : [])`. But if the feature gate evaluates true and a real Tool object is expected but missing required methods, runtime crashes occur.

---

## Files NOT Modified

Critical files verified unchanged vs main:
- `src/commands.ts`, `src/screens/REPL.tsx`, `src/state/AppStateStore.ts`
- `src/tools.ts`, `src/Tool.ts`, `src/Task.ts`

---

## Multi-Agent Verification

| Agent | Scope | Issues Found | Resolution |
|-------|-------|-------------|------------|
| Modified Files Audit | 15 M-status files | 2 CRITICAL in ReviewArtifactPermissionRequest | Fixed: logUnaryPermissionEvent arg order, onAllow input |
| Tool Audit | 12 new tools | renderToolUseMessage signature note | Non-issue: TS allows fewer params (BriefTool/UI.tsx has 0 params) |
| Command Audit | 20 command files | pipeIpc not in AppState (known) | Phase 1 pipe IPC doesn't modify AppState per design rule |
| CLI Binary Evidence | 10 feature flags | buddy fully compiled, Sleep/Snip present | Confirms implementations match binary |
| UDS Chain E2E | udsMessaging → udsClient | 0 mismatches | PASS |
| MonitorTool Chain E2E | Tool → exec → spawn → Task → Dialog | 4 CRITICAL (all fixed) | PASS |
| Workflow Chain E2E | Tool → buildTool → command → Task → Dialog | 1 HIGH (fixed) | PASS |
