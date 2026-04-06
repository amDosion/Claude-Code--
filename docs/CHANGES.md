# PR #2 — 完整修改报告

> **仓库**: amDosion/Claude-Code--
> **分支**: claude/agent-teams-communication-YT18t → main
> **合并 commit**: d6bd18b
> **日期**: 2026-04-06
> **文件数**: 55 (新增 40 + 修改 15)
> **代码量**: +4370 / -83

---

## 一、概述

本次提交包含三个阶段的实现:

1. **Phase 1 — Pipe IPC 主从通信系统** — 命名管道传输层、React hooks、6 个斜杠命令
2. **Phase 2 — 9 个 PARTIAL 特性标志实现 (P0-P8)** — 从 CLI v2.1.92 二进制文件逆向工程
3. **Phase 3 — 12 个 null 工具桩替换** — 完整 `buildTool()` 实现

### 核心原则
- **不修改原始文件** — 仅填充 stub 文件(1-5行) + 创建新文件
- 所有实现均有可验证来源（CLI 二进制、现有代码、类型定义）
- 所有 CodeRabbit 审核问题已解决

---

## 二、逐文件修改详情

### Phase 1: Pipe IPC 系统

#### 新文件 (pipe 相关)

| 文件 | 行数 | 说明 | 证据来源 |
|------|------|------|----------|
| `src/utils/pipeTransport.ts` | ~460 | 命名管道传输层：PipeServer、PipeClient、NDJSON 协议、`getPipeIpc()` 安全访问器、`PipeIpcState` 类型 | 自主设计，基于 `net` 模块 UDS |
| `src/hooks/usePipeIpc.ts` | ~230 | 主 hook：自动创建 PipeServer，处理 attach/detach/prompt 消息 | 参考 `useBackgroundTasks` 生命周期模式 |
| `src/hooks/useMasterRelay.ts` | ~130 | 主端 relay hook：将 slave 输出注入主会话，使用 `useRef` 避免重复绑定 | CodeRabbit 审核后修复了 listener leak |
| `src/hooks/useMasterMonitor.ts` | ~130 | 主端监控 hook：收集 slave 会话数据到 AppState | `SessionEntry` 类型本地定义 (非 AppStateStore) |
| `src/hooks/useSlaveNotifications.ts` | ~100 | Toast 通知 hook：slave 完成/错误/工具执行时显示 | 导入 `SessionEntry` from useMasterMonitor |
| `src/commands/attach/attach.ts` | ~90 | `/attach <pipe-name>` 命令：连接到 slave CLI | 使用 `getPipeIpc()` 安全访问 |
| `src/commands/detach/detach.ts` | ~90 | `/detach` 命令：断开 slave 连接 | 同上 |
| `src/commands/send/send.ts` | ~80 | `/send <slave> <message>` 命令 | 同上 |
| `src/commands/pipes/pipes.ts` | ~40 | `/pipes` 命令：列出所有可用管道 | 调用 `listPipes()` + `isPipeAlive()` |
| `src/commands/pipe-status/pipe-status.ts` | ~35 | `/pipe-status` 命令：显示当前连接状态 | 同上 |
| `src/commands/history/history.ts` | ~70 | `/history` 命令：查看 slave 会话历史 | 读取 `pipeIpc.slaves[name].history` |
| `src/commands/peers/peers.ts` | ~35 | `/peers` 命令：发现同机 Claude 实例 | 调用 `listPeers()` from udsClient |

#### 修改文件 (pipe 相关 — 原为 stub)

| 文件 | 原内容 | 修改后 | 关键修复 |
|------|--------|--------|----------|
| `src/utils/udsClient.ts` | `return null` | ~220 行完整 UDS 客户端 | peer 发现、消息发送、`isPeerAlive` |
| `src/utils/udsMessaging.ts` | `async function sendUdsMessage(): Promise<void> {}` | ~270 行 UDS 服务器 | NDJSON 协议、inbox/outbox、清理注册。移除了死导入 `getSessionId` |

---

### Phase 2: 9 个 PARTIAL 特性标志

#### P0: MONITOR_TOOL (4 文件)

| 文件 | 行数 | 修改类型 | 关键细节 |
|------|------|----------|----------|
| `src/tools/MonitorTool/MonitorTool.ts` | ~190 | 修改 (null→buildTool) | `await exec(command, abortController.signal, 'bash')` — 位置参数而非对象。`isReadOnly()` 改为 `false`（执行 shell 命令）。CLI 二进制中有 `tengu_monitor_tool_used` 遥测键 |
| `src/tasks/MonitorMcpTask/MonitorMcpTask.ts` | ~130 | 修改 (空→完整) | register/complete/fail/kill 生命周期。`generateTaskId('monitor_mcp')` 前缀 `'m'` |
| `src/components/tasks/MonitorMcpDetailDialog.tsx` | ~100 | 修改 (null→完整) | Dialog 使用 `onCancel`（非 `onDone`），`inputGuide` 为函数（非 JSX）|
| `src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx` | ~70 | 修改 (null→完整) | `PermissionRequestProps` 接口，Yes/No/Always 选项 |

#### P1: WORKFLOW_SCRIPTS (7 文件)

| 文件 | 行数 | 修改类型 | 关键细节 |
|------|------|----------|----------|
| `src/tools/WorkflowTool/WorkflowTool.ts` | ~75 | 修改 | 添加 4 个缺失字段：`prompt()`、`renderToolUseMessage()`、`mapToolResultToToolResultBlockParam()`、`maxResultSizeChars`。`call()` 返回错误信息而非假成功 |
| `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts` | ~200 | 修改 | 添加 `pendingAgentAction` 字段解决 skip/retry 空操作问题。CodeRabbit Critical 修复 |
| `src/components/tasks/WorkflowDetailDialog.tsx` | ~100 | 修改 (null→完整) | 工作流详情对话框 |
| `src/tools/WorkflowTool/WorkflowPermissionRequest.tsx` | ~70 | 新增 | 工作流权限对话框 |
| `src/tools/WorkflowTool/createWorkflowCommand.ts` | ~42 | 修改 (null→完整) | 扫描 `.claude/workflows/`，`getPromptForCommand(args, _context)` 修复签名 |
| `src/tools/WorkflowTool/constants.ts` | +3 行 | 修改 | 添加 `WORKFLOW_DIR_NAME`、`WORKFLOW_FILE_EXTENSIONS` |
| `src/tools/WorkflowTool/bundled/index.ts` | ~30 | 新增 | 内置工作流初始化 |

#### P2: REVIEW_ARTIFACT (2 文件)

| 文件 | 修改类型 | 关键修复 |
|------|----------|----------|
| `src/tools/ReviewArtifactTool/ReviewArtifactTool.ts` | null→buildTool | 完整 artifact 审查工具 |
| `src/components/permissions/ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.tsx` | null→完整 | **修复**: `logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')` 参数顺序。`onAllow(toolUseConfirm.input, [])` 而非 `onAllow({})`。拒绝路径顺序修复: `toolUseConfirm.onReject()` → `onReject()` → `onDone()` |

#### P3-P8: 其他特性标志

| 文件 | 特性标志 | 说明 |
|------|----------|------|
| `src/commands/buddy/buddy.tsx` + `index.ts` | BUDDY_SYSTEM | 伴侣系统，seeded RNG (mulberry32 + FNV-1a) |
| `src/commands/assistant/assistant.tsx` + `gate.ts` + `index.ts` | KAIROS | 助手面板控制 |
| `src/assistant/gate.ts` | KAIROS | 运行时 gate: `isKairosEnabled()` (async) |
| `src/commands/fork/fork.tsx` + `index.ts` | FORK | 会话分叉，标题碰撞解决 |
| `src/commands/proactive.ts` | PROACTIVE | 主动建议切换 |
| `src/commands/force-snip.ts` | CONTEXT_COLLAPSE | 强制裁剪历史 |
| `src/commands/subscribe-pr.ts` | KAIROS | PR webhook 订阅命令 |
| `src/commands/torch.ts` | KAIROS | 火炬传递命令 |
| `src/commands/workflows/index.ts` | WORKFLOW_SCRIPTS | 工作流列表命令 |
| `src/commands/remoteControlServer/index.ts` | KAIROS | 远程控制服务器 |
| `src/skills/mcpSkills.ts` | MCP | MCP 技能发现（读取 skill:// 资源，解析 frontmatter）|

---

### Phase 3: 12 个工具实现 (null→buildTool)

所有工具的 `call()` 方法返回明确的错误/不可用信息，而非误导性的成功响应。

| 工具 | 行数 | 功能 | call() 返回 |
|------|------|------|-------------|
| `SleepTool` | ~100 | 计时器，支持中断 | 实际计时实现 |
| `SnipTool` | ~93 | 历史裁剪 | 记录裁剪意图 |
| `VerifyPlanExecutionTool` | ~94 | 计划验证 | 验证结果 |
| `REPLTool` | ~88 | REPL 透明包装器 | `Error: REPL tool is not available in this build` |
| `ListPeersTool` | ~108 | UDS peer 发现 | peer 列表 |
| `SendUserFileTool` | ~83 | KAIROS 文件传输 | `sent: false, error: requires KAIROS` |
| `PushNotificationTool` | ~84 | 移动推送通知 | `sent: false, error: requires KAIROS` |
| `SubscribePRTool` | ~87 | PR webhook 订阅 | `subscribed: false, error: requires KAIROS` |
| `CtxInspectTool` | ~81 | 上下文窗口检查 | `requires CONTEXT_COLLAPSE runtime` |
| `TerminalCaptureTool` | ~83 | 终端面板捕获 | `requires TERMINAL_PANEL runtime` |
| `WebBrowserTool` | ~98 | 嵌入式浏览器 | `requires WEB_BROWSER_TOOL runtime` |
| `SuggestBackgroundPRTool` | ~83 | 后台 PR 建议 | `suggested: false, error: requires KAIROS` |

---

## 三、发现并修复的 Bug

### CodeRabbit 审核修复 (3 Critical + 1 Minor)

| 文件 | 严重性 | 问题 | 修复 |
|------|--------|------|------|
| `useMasterRelay.ts` | Critical | `onMessage(handler)` 注册但 cleanup 不移除，effect 重新运行时堆积 listener | 使用 `useRef` + `boundClientRef` 避免重复绑定 |
| `LocalWorkflowTask.ts` | Critical | `skipWorkflowAgent`/`retryWorkflowAgent` 是空操作 | 添加 `pendingAgentAction` 字段 |
| `REPLTool.ts` | Critical | `call()` 返回假成功 | 返回明确错误信息 |
| `useMasterRelay.ts` | Minor | error 路径忽略 `onSubmitMessage` 返回值 | 添加日志记录 |

### 多 Agent 审计修复

| 文件 | 问题 | 修复 |
|------|------|------|
| `MonitorTool.ts` | `exec()` 用对象参数调用（应为位置参数）+ 缺少 `await` | `await exec(command, abortController.signal, 'bash')` |
| `MonitorTool.ts` | `isReadOnly()` 返回 `true` 但执行 shell 命令 | 改为 `return false` |
| `MonitorMcpDetailDialog.tsx` | Dialog 用 `onDone`（应为 `onCancel`）| 改为 `onCancel` |
| `MonitorMcpDetailDialog.tsx` | `inputGuide` 传 JSX（应为函数） | 改为 `() => (...)` |
| `ReviewArtifactPermissionRequest.tsx` | `logUnaryPermissionEvent` 参数顺序错误 | 第一个参数应为 `'tool_use_single'` |
| `ReviewArtifactPermissionRequest.tsx` | `onAllow({})` 不匹配输入 schema | 改为 `onAllow(toolUseConfirm.input, [])` |
| `ReviewArtifactPermissionRequest.tsx` | 拒绝路径 `onDone()` 在 `onReject()` 之前 | 重新排序: reject → onReject → onDone |
| `useMasterMonitor.ts`/`useSlaveNotifications.ts` | `SessionEntry` 从 `AppStateStore.js` 导入但不存在 | 在 `useMasterMonitor.ts` 本地定义 |
| `udsMessaging.ts` | 死导入 `getSessionId` | 移除 |
| `createWorkflowCommand.ts` | `getPromptForCommand` 缺少第二个参数 | 添加 `_context` |
| 4 个工具 (Send/Push/Subscribe/Suggest) | `call()` 返回 `sent: true`/`subscribed: true` 假成功 | 改为 `false` + 错误信息 |
| `WorkflowTool.ts` | `call()` 返回假执行结果 | 返回明确错误信息 |
| 10 个 pipe 文件 | `state.pipeIpc` 直接访问，AppState 无此字段时崩溃 | 所有引用改用 `getPipeIpc(state)` 安全访问器 |

---

## 四、目录结构

```
changes/
├── src/
│   ├── assistant/
│   │   └── gate.ts                          # KAIROS runtime gate
│   ├── commands/
│   │   ├── assistant/                       # /assistant 命令
│   │   ├── attach/                          # /attach 命令
│   │   ├── buddy/                           # /buddy 命令
│   │   ├── detach/                          # /detach 命令
│   │   ├── force-snip.ts                    # /force-snip 命令
│   │   ├── fork/                            # /fork 命令
│   │   ├── history/                         # /history 命令
│   │   ├── peers/                           # /peers 命令
│   │   ├── pipe-status/                     # /pipe-status 命令
│   │   ├── pipes/                           # /pipes 命令
│   │   ├── proactive.ts                     # /proactive 命令
│   │   ├── remoteControlServer/             # 远程控制服务器
│   │   ├── send/                            # /send 命令
│   │   ├── subscribe-pr.ts                  # /subscribe-pr 命令
│   │   ├── torch.ts                         # /torch 命令
│   │   └── workflows/                       # /workflows 命令
│   ├── components/
│   │   ├── permissions/
│   │   │   ├── MonitorPermissionRequest/    # 监控权限对话框
│   │   │   └── ReviewArtifactPermissionRequest/  # 审查权限对话框
│   │   └── tasks/
│   │       ├── MonitorMcpDetailDialog.tsx    # 监控详情对话框
│   │       └── WorkflowDetailDialog.tsx      # 工作流详情对话框
│   ├── hooks/
│   │   ├── useMasterMonitor.ts              # 主端监控
│   │   ├── useMasterRelay.ts                # 主端 relay
│   │   ├── usePipeIpc.ts                    # 管道 IPC 主 hook
│   │   └── useSlaveNotifications.ts         # slave 通知
│   ├── skills/
│   │   └── mcpSkills.ts                     # MCP 技能发现
│   ├── tasks/
│   │   ├── LocalWorkflowTask/               # 工作流任务
│   │   └── MonitorMcpTask/                  # 监控任务
│   ├── tools/
│   │   ├── CtxInspectTool/                  # 上下文检查工具
│   │   ├── ListPeersTool/                   # peer 列表工具
│   │   ├── MonitorTool/                     # 监控工具
│   │   ├── PushNotificationTool/            # 推送通知工具
│   │   ├── REPLTool/                        # REPL 工具
│   │   ├── ReviewArtifactTool/              # 审查工具
│   │   ├── SendUserFileTool/                # 文件发送工具
│   │   ├── SleepTool/                       # 睡眠工具
│   │   ├── SnipTool/                        # 裁剪工具
│   │   ├── SubscribePRTool/                 # PR 订阅工具
│   │   ├── SuggestBackgroundPRTool/         # 后台 PR 建议工具
│   │   ├── TerminalCaptureTool/             # 终端捕获工具
│   │   ├── VerifyPlanExecutionTool/         # 计划验证工具
│   │   ├── WebBrowserTool/                  # 浏览器工具
│   │   └── WorkflowTool/                    # 工作流工具
│   └── utils/
│       ├── pipeTransport.ts                 # 管道传输层
│       ├── udsClient.ts                     # UDS 客户端
│       └── udsMessaging.ts                  # UDS 消息层
└── CHANGES.md                               # 本文件
```
