# Windows Terminal 分屏支持 — 变更报告

**分支**: `claude/windows-split-screen-support-dXHYc`
**日期**: 2026-04-07
**提交数**: 3

---

## 1. 概述

本 PR 为 Claude Code 的 swarm 系统添加了 **Windows Terminal 原生分屏支持**，
并将 **窗格启动逻辑与 Claude 解耦**，使任意 CLI 工具（cldex、Gemini CLI、自定义脚本等）
均可在分屏窗格中运行。

### 变更前

- 分屏 **仅** 支持 **tmux**（跨平台）和 **iTerm2**（macOS）
- Windows 用户 **必须安装 WSL + tmux** 才能使用 agent swarm
- PaneBackendExecutor 硬编码只启动 Claude 二进制 — 不支持非 Claude 工具

### 变更后

- 新增 **WindowsTerminalBackend**，使用 `wt.exe split-pane` 实现 Windows Terminal 原生分屏
- 通过 `WT_SESSION` 环境变量自动检测（原生 Windows 和 WSL 均可）
- PaneBackendExecutor 支持 `customCommand` 和 `skipMailbox`，可启动任意工具
- 检测优先级：tmux(内部) → iTerm2 → **Windows Terminal** → tmux(外部)

---

## 2. 变更文件（6个文件，+758 / -65 行）

| # | 文件 | 操作 | 行数变更 | 用途 |
|---|------|------|----------|------|
| 1 | `src/utils/swarm/backends/WindowsTerminalBackend.ts` | **新增** | +360 | 核心后端实现 |
| 2 | `src/utils/swarm/backends/detection.ts` | 修改 | +47 | WT 检测函数 |
| 3 | `src/utils/swarm/backends/registry.ts` | 修改 | +107/-20 | 后端注册、检测优先级、安装提示 |
| 4 | `src/utils/swarm/backends/types.ts` | 修改 | +28/-4 | 类型定义 |
| 5 | `src/utils/swarm/backends/PaneBackendExecutor.ts` | 修改 | +41/-41 | 自定义命令支持 |
| 6 | `docs/08-windows-terminal-pane-management.md` | **新增** | +175 | 限制追踪与解决方案提案 |

---

## 3. 详细变更证据

### 3.1 WindowsTerminalBackend.ts（新增 — 360 行）

**路径**: `src/utils/swarm/backends/WindowsTerminalBackend.ts`

**架构**: 延迟创建模式（Deferred Pane Creation）。

Windows Terminal 的 `wt.exe split-pane` 要求在创建窗格时就指定命令（不同于 tmux
先创建空窗格再发送命令的模式）。因此：

- `createTeammatePaneInSwarmView()` → 返回合成 pane ID，存储元数据
- `sendCommandToPane()` → 实际创建分屏窗格并执行命令

**关键代码证据**：

```typescript
// 延迟创建 — 注册元数据，返回合成 ID
async createTeammatePaneInSwarmView(
  name: string,
  color: AgentColorName,
): Promise<CreatePaneResult> {
  const paneId = generatePaneId()
  const isFirstTeammate = paneCount === 0
  const direction = isFirstTeammate ? '-V' : '-H'
  paneRegistry.set(paneId, { name, color, direction })
  paneCount++
  return { paneId, isFirstTeammate }
}

// 实际创建窗格在这里发生
async sendCommandToPane(paneId: PaneId, command: string): Promise<void> {
  const wtArgs = ['-w', '0', 'split-pane', direction, '--title', name]
  if (direction === '-V') wtArgs.push('--size', '0.7')
  // 平台特定的命令包装
  if (process.platform === 'win32') {
    wtArgs.push('cmd.exe', '/k', command)
  } else {
    wtArgs.push('bash', '-c', command)  // WSL
  }
  await execFileNoThrow(WT_COMMAND, wtArgs)
}
```

**自注册模式**（与 TmuxBackend/ITermBackend 一致）：
```typescript
registerWindowsTerminalBackend(WindowsTerminalBackend)
```

---

### 3.2 detection.ts — Windows Terminal 检测（+47 行）

**新增函数**：

| 函数 | 用途 | 检测方式 |
|------|------|----------|
| `isInWindowsTerminal()` | 判断是否在 Windows Terminal 内运行 | `WT_SESSION` 环境变量 |
| `isWtCliAvailable()` | 判断 wt.exe 是否在 PATH 中 | `wt.exe -?`（非 `--version`，后者不存在） |

**证据**：
```typescript
export const WT_COMMAND = 'wt.exe'

export function isInWindowsTerminal(): boolean {
  if (isInWindowsTerminalCached !== null) return isInWindowsTerminalCached
  isInWindowsTerminalCached = !!process.env.WT_SESSION
  return isInWindowsTerminalCached
}

export async function isWtCliAvailable(): Promise<boolean> {
  const result = await execFileNoThrow(WT_COMMAND, ['-?'])
  return result.code === 0
}
```

**为什么用 `wt.exe -?` 而不是 `--version`**：根据 Microsoft 官方文档
(https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)，
`--version` 不是 wt.exe 的合法参数。`-?` 是文档中记录的帮助标志。

**同时更新了 `resetDetectionCache()`** 以包含 `isInWindowsTerminalCached`。

---

### 3.3 registry.ts — 后端注册与检测优先级（+107/-20 行）

**新的检测优先级流程**：

```
优先级 1：在 tmux 内部         → TmuxBackend（始终优先）
优先级 2：在 iTerm2 + it2 CLI  → ITermBackend
优先级 3：在 Windows Terminal   → WindowsTerminalBackend  ← 新增
优先级 4：tmux 可用             → TmuxBackend（外部会话）
优先级 5：无可用后端            → 抛出错误并给出平台特定安装指引
```

**关键新增代码**：
```typescript
// 新的注册函数
let WindowsTerminalBackendClass: (new () => PaneBackend) | null = null
export function registerWindowsTerminalBackend(backendClass: new () => PaneBackend): void

// 动态导入
await import('./WindowsTerminalBackend.js')

// 检测逻辑
if (inWindowsTerminal) {
  const wtAvailable = await isWtCliAvailable()
  if (wtAvailable) {
    const backend = createWindowsTerminalBackend()
    // ... 缓存并返回
  }
  // wt.exe 不在 PATH 中则回退到 tmux
}

// getBackendByType 已更新
case 'windows-terminal':
  return createWindowsTerminalBackend()
```

**Windows 安装提示已更新**：
```
变更前："需要 WSL，然后 sudo apt install tmux"
变更后："方案1：Windows Terminal（推荐），方案2：WSL + tmux"
```

**`isInProcessEnabled()` 已更新**：
```typescript
const inWT = isInWindowsTerminal()
enabled = !insideTmux && !inITerm2 && !inWT  // WT 现在算作窗格后端
```

---

### 3.4 types.ts — 类型系统更新（+28/-4 行）

**BackendType 扩展**：
```typescript
// 变更前
export type BackendType = 'tmux' | 'iterm2' | 'in-process'
export type PaneBackendType = 'tmux' | 'iterm2'

// 变更后
export type BackendType = 'tmux' | 'iterm2' | 'windows-terminal' | 'in-process'
export type PaneBackendType = 'tmux' | 'iterm2' | 'windows-terminal'
```

**类型守卫已更新**：
```typescript
export function isPaneBackend(type: BackendType): type is 'tmux' | 'iterm2' | 'windows-terminal' {
  return type === 'tmux' || type === 'iterm2' || type === 'windows-terminal'
}
```

**TeammateSpawnConfig 扩展**（解耦）：
```typescript
export type TeammateSpawnConfig = TeammateIdentity & {
  // ... 已有字段 ...

  /** 自定义命令，替代 Claude 二进制执行 */
  customCommand?: string

  /** 跳过邮箱写入（用于非 Claude 进程） */
  skipMailbox?: boolean
}
```

---

### 3.5 PaneBackendExecutor.ts — 自定义命令支持（+41/-41 行）

**变更前**：硬编码 Claude 二进制启动：
```typescript
const binaryPath = getTeammateCommand()
const teammateArgs = [`--agent-id ...`, `--agent-name ...`, ...]
const spawnCommand = `cd ${workingDir} && env ${envStr} ${binaryPath} ${teammateArgs}`
```

**变更后**：同时支持 Claude 和任意命令：
```typescript
let spawnCommand: string
if (config.customCommand) {
  // 自定义命令模式：直接执行，不附加 Claude 标志
  spawnCommand = `cd ${quote([workingDir])} && ${config.customCommand}`
} else {
  // 默认模式：使用 teammate 身份启动 Claude（逻辑不变）
  const binaryPath = getTeammateCommand()
  // ... 与之前相同 ...
}
```

**邮箱跳过**：
```typescript
if (!config.skipMailbox) {
  await writeToMailbox(config.name, { from: 'team-lead', text: config.prompt, ... }, config.teamName)
}
```

---

## 4. 提交历史

| # | 哈希 | 提交信息 |
|---|------|----------|
| 1 | `e8e1e78` | feat: 添加 Windows Terminal 原生分屏后端并解耦窗格启动 |
| 2 | `c953084` | fix: 根据官方 wt.exe CLI 文档修正 WindowsTerminalBackend |
| 3 | `5099ba1` | docs: 追踪 wt.exe 限制并提出自研窗格管理器方案 |

---

## 5. 已知限制（已记录）

详见 `docs/08-windows-terminal-pane-management.md`。

| 限制 | 影响 | 当前解决方案 |
|------|------|-------------|
| wt.exe 不返回 Pane ID | 无法追踪单个窗格 | 合成 ID |
| 无法向已有窗格发送命令 | 无法在创建后交互 | 延迟创建模式 |
| 无法按 ID 关闭窗格 | 无法程序化关闭 | 邮箱关闭请求 |
| 无法查询窗格状态 | 无法监控健康 | 信任进程生命周期 |
| 创建后无法更新颜色/标题 | 无法动态更新外观 | 创建时设置 |

**上游追踪**: `microsoft/terminal#16568`, `microsoft/terminal#8855`

---

## 6. 构建验证

```
$ npx tsc --noEmit 2>&1 | grep -E "swarm/backends|WindowsTerminal|detection"
（无错误）
```

所有新代码编译通过。唯一的预存错误在 `WorkflowTool.ts` 中（与本 PR 无关）。

---

## 7. 测试说明

**当前环境无法测试**（Linux，无 Windows Terminal）。
测试需要：

- [ ] Windows 10/11 + 已安装 Windows Terminal
- [ ] WSL + Windows Terminal 互操作
- [ ] 验证 `WT_SESSION` 环境变量被正确检测
- [ ] 验证 `wt.exe -?` 返回退出码 0
- [ ] 验证 `wt.exe -w 0 split-pane -V --title "test" -- cmd.exe /k echo hello`
- [ ] 验证延迟创建模式端到端可用
- [ ] 验证 customCommand 可启动非 Claude 工具
