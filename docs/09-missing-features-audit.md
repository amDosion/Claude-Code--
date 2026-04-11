# RE-Claude-Code 未完成功能审计报告

> 审计日期：2026-04-11
> 审计范围：全部 13 份文档 + 1,987 个 TypeScript 源文件
> 方法：6 个并行分析代理对文档描述 vs 实际代码进行交叉比对

---

## 总览

| 功能模块 | 完成度 | 关键缺失 |
|----------|--------|----------|
| Buddy (AI 宠物) | 95% | Soul API、命令命名不一致 |
| KAIROS (持久助手) | ~65% | 助手核心模块、Session 发现、Dream 技能 |
| Coordinator (多智能体) | ~100% | 无关键缺失 |
| Bridge (远程控制) | ~95% | 独立 CLI 入口未接线 |
| Pipe IPC (主从通信) | 100% | 无 |
| Windows Terminal (分屏) | 100% (当前版本) | 高级方案为文档规划，尚未实现 |
| Phase 3 工具 (12个) | 结构 100%，功能 33% | 8 个工具为运行时 Stub |
| 隐藏命令 (36个) | 55% 功能性 | 15 个 Stub + 1 个完全缺失 |

---

## 1. Buddy (AI 宠物伴侣) — 完成度 95%

**文档**: `docs/01-buddy.md`
**源码**: `src/buddy/` (6 文件) + `src/commands/buddy/` (2 文件)

### 已完成
- 18 种物种、5 种稀有度、1% 闪光概率的确定性生成系统 (FNV-1a + Mulberry32)
- 5 维属性系统
- 全部 18 种物种 ASCII 精灵动画 (3 帧/种)
- CompanionSprite React 组件 (idle 动画、pet 反应、语音气泡)
- AI 上下文注入系统 (companion_intro 附件)
- 启动预告 (4 月 1-7 日彩虹 `/buddy` 提示)
- Feature flag `BUDDY` + `isBuddyLive()` 运行时门控

### 未完成
| 缺失项 | 描述 | 严重程度 |
|---------|------|----------|
| Soul 生成 API | 文档描述为 AI 模型生成名字+个性，实际使用硬编码回退 (基于 species/eye charCodes)。注释写明需要 `/api/organizations/{org}/claude_code/buddy_react` | 低 (回退可用) |
| `/buddy mute` 命名 | 文档写 `/buddy mute` / `/buddy unmute`，代码实际为 `/buddy off` / `/buddy on` | 低 (文档不一致) |
| `/buddy card` 子命令 | 文档列为独立命令，实际集成在 `/buddy` 基础命令中 | 低 (文档不一致) |

---

## 2. KAIROS (永不休眠助手) — 完成度 ~65%

**文档**: `docs/02-kairos.md`
**源码**: `src/assistant/`, `src/services/autoDream/`, `src/proactive/`, `src/tasks/DreamTask/`

### 已完成
- Auto-Dream 内存整合系统 (3 门控 + 4 阶段提示: Orient/Gather/Consolidate/Prune)
- 整合锁机制 (PID 跟踪 + 过期检测)
- Cron 任务调度 (1s tick + chokidar 文件监视 + jitter 防惊群)
- 会话历史 API (OAuth v1/sessions/{id}/events + 分页)
- Proactive 状态机 (`active`/`paused`/`contextBlocked` + listener 模式)
- Feature flags 完整 (162 处 `feature('KAIROS')` 引用)
- 内存路径系统 (`autoMemPath/logs/YYYY/MM/YYYY-MM-DD.md`)
- BriefTool 和 SendUserFileTool
- DreamTask UI 状态管理

### 未完成 — 关键缺失
| 缺失项 | 文件 | 描述 | 严重程度 |
|---------|------|------|----------|
| 助手核心模块 5 个函数 | `src/assistant/index.ts` | 仅导出 `isAssistantMode()` 和 `isAssistantModeEnabled()`。**缺失**: `markAssistantForced()`, `isAssistantForced()`, `initializeAssistantTeam()`, `getAssistantSystemPromptAddendum()`, `getAssistantActivationPath()` — 均从 `main.tsx` 调用 | **高** |
| Session 发现 | `src/assistant/sessionDiscovery.ts` | Stub 实现 — 返回空数组 `[]`。缺失 Bridge 环境枚举和会话过滤逻辑 | **高** |
| Dream 技能 | `src/skills/bundled/dream.ts` | `registerDreamSkill()` 为空函数 (no-op)。Feature gate `KAIROS`/`KAIROS_DREAM` 存在但技能体未实现 | **中** |
| Proactive React Hook | `src/proactive/useProactive.ts` | 返回硬编码 `{active: false, paused: false}`，与实际 `src/proactive/index.ts` 状态机完全断开 | **中** |
| 助手面板 UI 状态 | — | `commands/assistant/assistant.tsx` 引用 `assistantPanelVisible` AppState 字段，但该字段定义未找到 | **中** |

---

## 3. Coordinator (多智能体编排) — 完成度 ~100%

**文档**: `docs/04-coordinator.md`
**源码**: `src/coordinator/` (2 文件)

### 已完成
- 模式检测 (`feature('COORDINATOR_MODE')` + 环境变量)
- 工具过滤 (Coordinator 只有 Agent/SendMessage/TaskStop/SyntheticOutput)
- 370 行系统提示 (4 阶段、并发规则、反模式)
- Worker 通信 (XML `<task-notification>` 格式)
- Scratchpad 跨 Worker 知识共享

### 架构限制 (非 Bug，属设计边界)
- 无级联停止 (stop all workers for failed dependency)
- 无自动依赖图 (coordinator 手动跟踪)
- 无上下文重叠度量 (continue vs spawn 为手动决策)

---

## 4. Bridge (远程终端控制) — 完成度 ~95%

**文档**: `docs/06-bridge.md`
**源码**: `src/bridge/` (33 文件, ~13K LOC)

### 已完成
- 独立模式 (`bridgeMain.ts`, 2999 行) + REPL 嵌入模式
- 双协议 (v1 Environment API + v2 直连 session-ingress)
- 完整认证 (OAuth + JWT + Trusted Device + 401 恢复)
- 消息去重 (BoundedUUIDSet, 2000 条循环缓冲)
- 3 种会话分发模式 (single-session / worktree / same-dir)
- 崩溃恢复 (bridge-pointer.json, 4h TTL)
- CCR Mirror 模式

### 未完成
| 缺失项 | 文件 | 描述 | 严重程度 |
|---------|------|------|----------|
| 独立 CLI 入口 | `src/commands/remoteControlServer/index.ts` | 导出 `null`。`bridgeMain.ts` 有完整实现但未接线到 `claude remote-control` CLI 命令 | **中** |

---

## 5. Pipe IPC (主从通信) — 完成度 100%

**文档**: `docs/pipe-master-slave-design.md`, `docs/pipe-master-slave-complete.md`
**源码**: `src/utils/pipeTransport.ts`, `src/hooks/usePipeIpc.ts`, `src/hooks/useMasterMonitor.ts`

全部功能已实现：传输层、6 个命令 (`/pipes`, `/attach`, `/detach`, `/send`, `/history`, `/pipe-status`)、REPL 集成、状态模型、测试套件 (450 行, 11 测试用例)。

**无缺失项。**

---

## 6. Windows Terminal 分屏 — 完成度 100% (当前版本)

**文档**: `docs/08-windows-terminal-pane-management.md`
**源码**: `src/utils/swarm/backends/WindowsTerminalBackend.ts` (360 行)

当前 deferred-creation 模式完整实现。以下为文档规划的未来方案：

| 未来方案 | 状态 | 备注 |
|----------|------|------|
| Named Pipe IPC Agent (Option C) | 未实现 | 中期方案，需 microsoft/terminal#16568 |
| ConPTY Pane Manager (Option A) | 未实现 | 长期方案，需原生 C++ 编译 |
| 创建后面板管理 | 不可用 | wt.exe 无 pane ID / list-panes / send-keys API |

---

## 7. Phase 3 工具 (12 个) — 结构 100%，实际功能 33%

所有 12 个工具在 `src/tools/` 下有完整目录结构和类型定义，但 8 个为运行时 Stub：

### 真正功能性 (4/12)
| 工具 | 行数 | 状态 |
|------|------|------|
| SleepTool | 100 | 真实计时器 + 中断支持 |
| SnipTool | 92 | 记录裁剪意图，由 query engine 处理 |
| VerifyPlanExecutionTool | 93 | 计划验证 + 步骤跟踪 |
| ListPeersTool | 107 | 真实 UDS peer 发现 |

### 运行时 Stub (8/12) — 返回错误信息
| 工具 | 依赖的运行时 | 返回消息 |
|------|-------------|----------|
| REPLTool | ant-native | "REPL tool is not available in this build" |
| SendUserFileTool | KAIROS transport | "requires the KAIROS assistant transport layer" |
| PushNotificationTool | KAIROS transport | "requires the KAIROS transport layer" |
| SubscribePRTool | KAIROS webhooks | "requires the KAIROS GitHub webhook subsystem" |
| CtxInspectTool | CONTEXT_COLLAPSE | "requires the CONTEXT_COLLAPSE runtime" |
| TerminalCaptureTool | TERMINAL_PANEL | "provided by the TERMINAL_PANEL runtime" |
| WebBrowserTool | WEB_BROWSER_TOOL | "requires the WEB_BROWSER_TOOL runtime" |
| SuggestBackgroundPRTool | KAIROS | "requires the KAIROS runtime" |

---

## 8. 隐藏命令 — 功能性 55% (20/36)

### Feature-gated 命令 (10/12 实现)
| 命令 | Feature Flag | 状态 |
|------|-------------|------|
| `/buddy` | BUDDY | 完整实现 |
| `/assistant` | KAIROS | 完整实现 |
| `/brief` | KAIROS_BRIEF | 完整实现 |
| `/bridge` | BRIDGE_MODE | 完整实现 |
| `/voice` | VOICE_MODE | 完整实现 (含 STT/设置/分析) |
| `/ultraplan` | ULTRAPLAN | 完整实现 (66KB, CCR 远程会话) |
| `/fork` | FORK_SUBAGENT | 完整实现 |
| `/peers` | UDS_INBOX | 完整实现 |
| `/workflows` | WORKFLOW_SCRIPTS | 完整实现 |
| `/force-snip` | HISTORY_SNIP | 完整实现 |
| `/proactive` | PROACTIVE | **Stub** (exports null) |
| `/torch` | TORCH | **Stub** (exports null) |

### Internal-only 命令 (10 实现 / 13 Stub / 1 缺失)

**有实现的 (10):**
`/init-verifiers`, `/commit-push-pr`, `/bridge-kick`, `/tag`, `/files`, `/agents-platform`, `/commit`, `/addDir`, `/remote-setup`, `/brief`

**Stub 命令 (13) — 导出 `null` 或 `isEnabled: () => false`:**
`/teleport`, `/bughunter`, `/mock-limits`, `/ctx_viz`, `/break-cache`, `/ant-trace`, `/good-claude`, `/autofix-pr`, `/debug-tool-call`, `/reset-limits`, `/backfill-sessions`, `/perf-issue`, `/share`, `/summary`, `/onboarding`, `/env`, `/subscribe-pr`

**完全缺失 (1):**
| 命令 | 状态 |
|------|------|
| `/tags` | 文档中有描述但代码库中未找到实现 |

---

## 优先级排序 — 建议实现顺序

### P0 — 高优先级 (阻塞核心功能)
1. **KAIROS 助手核心模块** — 补充 `assistant/index.ts` 缺失的 5 个函数 (`markAssistantForced`, `isAssistantForced`, `initializeAssistantTeam`, `getAssistantSystemPromptAddendum`, `getAssistantActivationPath`)
2. **Session 发现** — 实现 `sessionDiscovery.ts` 的 Bridge 环境枚举和会话过滤
3. **Proactive React Hook** — 连接 `useProactive.ts` 到实际状态机

### P1 — 中优先级 (功能完整性)
4. **Dream 技能** — 实现 `registerDreamSkill()` 的磁盘技能注册
5. **Bridge 独立 CLI** — 将 `bridgeMain.ts` 接线到 `remoteControlServer` 命令
6. **`/proactive` 命令** — 实现实际的 proactive 模式切换 (当前 exports null)
7. **`/torch` 命令** — 实现 torch 功能
8. **助手面板 UI 状态** — 定义 `assistantPanelVisible` AppState 字段

### P2 — 低优先级 (运行时依赖/文档修正)
9. **8 个运行时 Stub 工具** — 需要对应运行时才能实现 (KAIROS transport, CONTEXT_COLLAPSE, TERMINAL_PANEL, WEB_BROWSER_TOOL, ant-native)
10. **13 个 Internal-only Stub 命令** — 内部调试工具，外部用户不需要
11. **Buddy 文档对齐** — 统一命令名称 (`mute`→`off`) 和子命令结构
12. **`/tags` 命令** — 补充缺失的命令实现
13. **Soul 生成 API** — 对接 Buddy AI 名字/个性生成端点

### P3 — 未来规划 (文档已描述)
14. Windows Terminal Named Pipe IPC Agent
15. ConPTY Pane Manager
16. Coordinator 级联停止和自动依赖图

---

## 统计汇总

| 指标 | 数量 |
|------|------|
| 总源文件数 | 1,987 |
| 文档文件数 | 13 |
| 已完成功能模块 | 3/8 (Pipe IPC, Coordinator, Windows Terminal) |
| 基本完成模块 | 3/8 (Buddy, Bridge, Phase 3 工具结构) |
| 需大量工作模块 | 2/8 (KAIROS, 隐藏命令) |
| Stub 工具数 | 8/12 |
| Stub 命令数 | 15/36 |
| 完全缺失命令 | 1 (`/tags`) |
| 缺失函数/导出 | 5 (assistant/index.ts) |
| 缺失技能注册 | 1 (dream skill) |
