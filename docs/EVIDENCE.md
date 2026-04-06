# CLI 二进制逆向工程证据

> **二进制文件**: `/tmp/claude-latest/node_modules/@anthropic-ai/claude-code/cli.js` (v2.1.92, 16938 行, 高度压缩)
> **检索日期**: 2026-04-06

---

## 一、工具名称匹配

| 工具 | 二进制证据 | 强度 | 确认内容 |
|------|-----------|------|----------|
| `REPLTool` | `"repl_tool_call"` (1x), `"repl_main_thread"` (15x), `REPL_ID`, `REPL_MODE`, `tengu_bridge_repl_*` (14个遥测键), `tengu_repl_hook_finished` | **强** | REPL 工具调度路径、会话生命周期完整确认 |
| `WebBrowserTool` | `chrome_bridge_tool_call_started/completed/error/timeout` (4键), `"ChromeNativeHost"`, `claudeInChromeDefaultEnabled`, `webBrowserPrefs`, `"hasCompletedClaudeInChromeOnboarding"` | **强** | Chrome 桥接工具调用完整生命周期、原生主机路径配置确认 |
| `WorkflowTool` | `"local_workflow"` (10x), `workflowAction` (5x), `workflowExists` (7x), `workflowName` (3x), `workflowTasks` (2x), `"workflowContent"`, `"workflow_file_exists"` | **强** | 丰富的工作流对象结构直接确认本地工作流执行工具 |
| `MonitorTool` | `monitor_mcp` (9x), `"monitor"` (6x), `"EvaluationMonitor"`, `"StepMonitor"` | 部分 | `monitor_mcp` (9次出现) 确认监控 MCP 集成 |
| `SnipTool` | `tengu_snip_resume_filtered` (1x), `snip_resume` (1x), `"snip"` (1x) | 部分 | snip/resume 流程存在，遥测键直接映射裁剪行为 |
| `VerifyPlanExecutionTool` | `"verify_plan_reminder"` (字符串常量) | 部分 | verify-plan 提醒机制确认 |
| `TerminalCaptureTool` | `"showStatusInTerminalTab"`, `tengu_terminal_sidebar`, `tengu_terminal_tab_status_setting_changed` | 部分 | 终端侧边栏和标签状态事件确认终端面板集成 |
| `PushNotificationTool` | `"agentPushNotifEnabled"` (配置键) | 部分 | agent 推送通知启用/禁用配置标志确认 |
| `CtxInspectTool` | `contextCollapseCommits`, `contextCollapseSnapshot` | 部分 | 上下文折叠跟踪属性确认上下文检查逻辑存在 |
| `ListPeersTool` | `"peer_connected"`, `"peer_disconnected"`, `chrome_bridge_peer_*` | 部分 | Chrome 桥接中的 peer 列表基础设施确认 |
| `SleepTool` | `"sleep"` (5x), `bridge_poll_sleep_detected` | 间接 | sleep 状态/动作值存在 |
| `SendUserFileTool` | 未找到 | 未找到 | 可能在编译时被 DCE 消除 |
| `ReviewArtifactTool` | 未找到 | 未找到 | 同上 |
| `SubscribePRTool` | `"SUBSCRIBE"`, `"UNSUBSCRIBE"` (通用常量) | 弱 | 通用发布/订阅常量存在 |
| `SuggestBackgroundPRTool` | `"tengu_prompt_suggestion"` | 弱 | 建议基础设施存在 |

---

## 二、特性标志匹配

| 标志 | 二进制证据 | 强度 | 确认内容 |
|------|-----------|------|----------|
| `KAIROS` | `kairosEnabled` (3x), `kairosActive` (5x), `kairos_cron`, `kairos_brief` | **强** | `kairosEnabled` 和 `kairosActive` 布尔属性确认运行时特性标志 |
| `PROACTIVE` | `PROACTIVE_SECTION`, `PROACTIVELY_REFRESHED`, `"proactive_refresh"` | **强** | 大写常量和事件名确认主动刷新特性 |
| `CONTEXT_COLLAPSE` | `contextCollapseCommits`, `contextCollapseSnapshot` | **强** | 两个不同的上下文折叠属性确认特性存在 |
| `WEB_BROWSER_TOOL` | `webBrowserPrefs`, `claudeInChromeDefaultEnabled`, Chrome 桥接事件 | **强** | 配置对象和默认启用开关确认 |
| `BUDDY_SYSTEM` | `"buddy"`, `"buddy_companion"`, `buddy_react` | 部分 | 伴侣系统字符串存在 |
| `TERMINAL_PANEL` | `tengu_terminal_sidebar`, `showStatusInTerminalTab` | 部分 | 终端面板 UI 特性带设置确认 |
| `MONITOR_TOOL` | `monitor_mcp` (9x) | 间接 | 通过 MCP 路由调用 |
| `WORKFLOW_SCRIPTS` | `"local_workflow"`, `workflows/` 路径 | 间接 | 工作流执行已实现 |

---

## 三、遥测键匹配

| 键名 | 匹配数 | 上下文 | 确认内容 |
|------|--------|--------|----------|
| `tool_use_single` | **27** | `completionType:w="tool_use_single"`, 权限日志事件 | 核心权限/日志事件，确认 `logUnaryPermissionEvent` 第一个参数 |
| `tengu_kairos_*` | 多键 | `tengu_kairos_brief`, `tengu_kairos_cron`, `tengu_kairos_cron_durable` | KAIROS 功能完整遥测 |
| `tengu_bridge_repl_*` | **19键** | connect_timeout, env_expired, env_lost, env_registered, fatal_error, history_capped, poll_error, poll_give_up, reconnect_failed, reconnected_in_place, session_failed, skipped, started, suspension_detected, teardown, work_received, work_secret_failed, ws_closed, ws_connected | REPL 会话完整生命周期 |
| `chrome_bridge_tool_call_*` | 4键 | started, completed, error, timeout | WebBrowserTool 调度完整生命周期 |
| `tengu_snip_resume_filtered` | 1 | snip 裁剪过滤 | SnipTool 行为确认 |
| `tengu_terminal_sidebar` | 1 | 终端侧边栏 | TerminalCaptureTool 确认 |
| `tengu_repl_hook_finished` | 1 | REPL hook 完成 | REPLTool 钩子确认 |
| `tengu_amber_*` | 10键 | flint, json_tools, lantern, lark, prism, quartz_disabled, redwood, stoat, swift, wren | 实验标志体系确认 |

---

## 四、函数/API 匹配

| 函数 | 二进制证据 | 确认内容 |
|------|-----------|----------|
| `getFeatureValue` | `getFeatureValue` (2x), `getFeatureValue_CACHED_MAY_BE_STALE` (1x), `getFeatureValue_CACHED_WITH_REFRESH` (1x), `getFeatureValue_DEPRECATED` (1x) | 特性值访问 API 完整确认，含缓存变体 |
| `zodToJsonSchema` | 存在 (1x) | Zod schema → JSON Schema 转换确认（用于工具输入 schema 生成） |
| `DEFAULT_WORKFLOW_TOKEN` | 存在 (精确字符串) | 工作流认证令牌常量确认 |
| `completion_type:"tool_use_single"` | 存在 | `language_name:"none"` 同行出现，确认 ReviewArtifactPermissionRequest 中使用的字段值 |
| `onAllow`/`onReject` 模式 | `q.onReject(y); else q.onReject()` | 权限请求的接受/拒绝调用模式确认 |
| `buildTool`/`spawnShellTask`/`logUnaryPermissionEvent` | 未找到 | 被压缩器重命名为单字符变量（正常，所有函数名在压缩后消失） |

---

## 五、Schema 模式

| 模式 | 二进制证据 | 说明 |
|------|-----------|------|
| `z.object({` | 3 处 | 直接 Zod 对象 schema 构造存在 |
| `z.string()` | 7 处 | 字符串 schema 字段使用 |
| `z.enum([` | 1 处 | 枚举验证存在 |
| `z.array(` | 1 处 | 数组 schema 存在 |
| `z.boolean()` | 1 处 | 布尔字段存在 |
| `z.strictObject` | 0 | 不存在于二进制（编译时内联或 DCE） |
| `lazySchema` | 0 | 同上 |

---

## 六、源代码层面证据

### 1. Tool 接口必填字段 (src/Tool.ts)

所有 12 个工具实现均包含 `buildTool()` 要求的全部字段:
`name`, `inputSchema`, `description()`, `prompt()`, `maxResultSizeChars`, `renderToolUseMessage()`, `mapToolResultToToolResultBlockParam()`, `call()`

### 2. exec() 函数签名 (src/utils/Shell.ts:181)

```typescript
export async function exec(command, abortSignal, shellType, options?)
```
MonitorTool: `await exec(command, abortController.signal, 'bash')` — 匹配位置参数。

### 3. Dialog 组件 (src/components/Dialog.tsx)

`onCancel` (非 `onDone`), `inputGuide` 为函数 (非 JSX) — MonitorMcpDetailDialog 正确使用。

### 4. logUnaryPermissionEvent 签名

第一个参数为 `'tool_use_single'` CompletionType 字符串 — 二进制中 `tool_use_single` 出现 27 次确认。

### 5. Task 框架

`generateTaskId`, `registerTask`, `updateTaskState`, `createTaskStateBase` — LocalWorkflowTask 和 MonitorMcpTask 均正确使用。

---

## 七、总结

| 强度分类 | 工具/特性 |
|----------|----------|
| **强确认** | WebBrowserTool, REPLTool, WorkflowTool, KAIROS, PROACTIVE, CONTEXT_COLLAPSE, tool_use_single, getFeatureValue API, zodToJsonSchema |
| **部分确认** | SnipTool, MonitorTool, PushNotificationTool, TerminalCaptureTool, VerifyPlanExecutionTool, BUDDY_SYSTEM, CtxInspectTool |
| **间接/弱** | SleepTool, ListPeersTool, SubscribePRTool, SuggestBackgroundPRTool |
| **未找到 (DCE)** | SendUserFileTool, ReviewArtifactTool — 可能被 `feature()` 编译时常量消除 |
