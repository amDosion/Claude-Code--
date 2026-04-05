# PARTIAL 特性标志补全实施计划

> 日期: 2026-04-05
> 范围: 9 个 PARTIAL 标志（排除已完成的 BUDDY）
> 方法: 官方 CLI 逆向 + 代码库上下文推导 + 自定义实现

---

## 数据来源分类

| 标志 | 官方 CLI 中存在 | 实施方法 |
|------|----------------|----------|
| FORK_SUBAGENT | 存在完整实现 | 从官方 cli.js 逆向还原 |
| HISTORY_SNIP | 不存在 | 根据代码库引用上下文设计实现 |
| KAIROS_GITHUB_WEBHOOKS | 不存在（已演进为 Channels） | 根据代码库引用上下文设计实现 |
| MCP_SKILLS | 不存在 | 根据 mcpSkillBuilders.ts 补全 |
| REVIEW_ARTIFACT | 不存在 | 根据权限框架模式自定义实现 |
| MONITOR_TOOL | 不存在 | 根据 LocalShellTask 和权限模式实现 |
| KAIROS | 不存在完整 assistant 命令 | 根据代码库引用上下文设计入口 |
| UDS_INBOX | 部分存在 | 基于 SendMessageTool + 自定义 UDS 层 |
| WORKFLOW_SCRIPTS | 不存在 | 根据框架模式自定义实现 |

---

## P0: FORK_SUBAGENT

**缺失**: `src/commands/fork/index.ts`
**来源**: 官方 CLI 逆向（完整实现存在）

**设计**:
- 命令类型: `local-jsx`
- 命令名: `fork`
- 描述: "Create a fork of the current conversation at this point"
- 参数: `[name]` — 可选的分叉名称
- 功能: 将当前对话的完整消息历史复制到新的 sessionId，创建独立分支
- 核心逻辑:
  1. 读取当前会话消息
  2. 生成新 sessionId
  3. 序列化消息到新会话路径
  4. 生成分叉标题（"原标题 (Fork N)"）
  5. 如果 context.resume 可用，自动切换到分叉会话
  6. 否则返回 resume 命令提示

---

## P1: HISTORY_SNIP

**缺失**: `src/commands/force-snip.ts`
**来源**: 代码库上下文推导

**设计**:
- 命令类型: `local`
- 命令名: `force-snip`
- 描述: "Force snip conversation history at current point"
- 功能: 强制在当前位置截断/折叠历史消息，减少上下文窗口占用
- 核心逻辑:
  1. 获取当前消息列表
  2. 标记截断点
  3. 将截断点之前的消息折叠为摘要
  4. 更新消息队列

**引用上下文**:
- src/QueryEngine.ts — 查询引擎中检查 snip 点
- src/query.ts — 查询中的 snip 处理
- src/utils/collapseReadSearch.ts — 折叠读取/搜索
- src/utils/messages.ts — 消息处理
- src/utils/attachments.ts — 附件处理

---

## P2: KAIROS_GITHUB_WEBHOOKS

**缺失**: `src/commands/subscribe-pr.ts`
**来源**: 代码库上下文推导

**设计**:
- 命令类型: `local`
- 命令名: `subscribe-pr`
- 描述: "Subscribe to GitHub PR activity"
- 功能: 订阅 GitHub PR 事件（评论、CI、审查），接收实时通知
- 核心逻辑:
  1. 解析 PR URL 或编号
  2. 通过 REPL Bridge 或 MCP 建立事件订阅
  3. 接收事件时注入为系统消息

---

## P3: MCP_SKILLS

**缺失**: `src/skills/mcpSkills.ts`（3 行空壳）
**设计**: 补全 MCP 技能加载逻辑，与 mcpSkillBuilders.ts (44行) 配合

---

## P4: REVIEW_ARTIFACT

**缺失**: `ReviewArtifactTool.ts`(1行) + `ReviewArtifactPermissionRequest.tsx`(3行)
**设计**: 按照现有 Tool 模式（如 BriefTool）实现审查工件工具

---

## P5: MONITOR_TOOL

**缺失**: `MonitorTool.ts`(1行) + `MonitorMcpTask.ts`(5行) + `MonitorMcpDetailDialog.tsx`(3行) + `MonitorPermissionRequest.tsx`(3行)
**设计**: 基于 LocalShellTask.tsx (522行) 已有逻辑，补全监控工具和 UI 组件

---

## P6: KAIROS

**缺失**: `src/commands/assistant/index.ts` + `gate.ts`
**设计**: 创建 assistant 命令入口和门控逻辑

---

## P7: UDS_INBOX

**缺失**: `udsMessaging.ts`(1行) + `udsClient.ts`(3行) + `commands/peers/index.ts`
**设计**: 实现 Unix Domain Socket 消息传输层和 peers 命令

---

## P8: WORKFLOW_SCRIPTS

**缺失**: 7 个空壳文件 + `commands/workflows/`
**设计**: 实现工作流定义、执行、UI 组件完整系统
