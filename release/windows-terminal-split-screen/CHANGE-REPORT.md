# Windows Terminal Split Screen Support — Change Report

**Branch**: `claude/windows-split-screen-support-dXHYc`
**Date**: 2026-04-07
**Commits**: 3

---

## 1. Summary

This PR adds **native Windows Terminal split-pane support** to Claude Code's swarm
system, and **decouples pane spawning from Claude-only usage**, enabling arbitrary
CLI tools (cldex, Gemini CLI, custom scripts, etc.) to run in split panes.

### Before

- Split-screen ONLY supported via **tmux** (cross-platform) and **iTerm2** (macOS)
- Windows users REQUIRED WSL + tmux to use agent swarms
- PaneBackendExecutor hardcoded Claude binary spawning — no support for non-Claude tools

### After

- New **WindowsTerminalBackend** uses `wt.exe split-pane` for native Windows Terminal support
- Auto-detected via `WT_SESSION` env var (works on both native Windows and WSL)
- PaneBackendExecutor supports `customCommand` and `skipMailbox` for arbitrary tool spawning
- Detection priority: tmux(inside) → iTerm2 → **Windows Terminal** → tmux(external)

---

## 2. Files Changed (6 files, +758 / -65 lines)

| # | File | Action | Lines Changed | Purpose |
|---|------|--------|---------------|---------|
| 1 | `src/utils/swarm/backends/WindowsTerminalBackend.ts` | **NEW** | +360 | Core backend implementation |
| 2 | `src/utils/swarm/backends/detection.ts` | Modified | +47 | WT_SESSION detection + wt.exe availability check |
| 3 | `src/utils/swarm/backends/registry.ts` | Modified | +107/-20 | Backend registration, detection priority, install instructions |
| 4 | `src/utils/swarm/backends/types.ts` | Modified | +28/-4 | Add 'windows-terminal' type, customCommand/skipMailbox options |
| 5 | `src/utils/swarm/backends/PaneBackendExecutor.ts` | Modified | +41/-41 | Support customCommand for non-Claude tools |
| 6 | `docs/08-windows-terminal-pane-management.md` | **NEW** | +175 | Limitations tracking and custom solution proposals |

---

## 3. Detailed Evidence of Changes

### 3.1 WindowsTerminalBackend.ts (NEW — 360 lines)

**Location**: `src/utils/swarm/backends/WindowsTerminalBackend.ts`

**Architecture**: Deferred pane creation pattern.

Windows Terminal's `wt.exe split-pane` requires the command at creation time (unlike
tmux where you create an empty pane then send commands). Therefore:

- `createTeammatePaneInSwarmView()` → returns synthetic pane ID, stores metadata
- `sendCommandToPane()` → actually creates the split pane with the command

**Key code evidence**:

```typescript
// Deferred pane creation — registers metadata, returns synthetic ID
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

// Actual pane creation happens here
async sendCommandToPane(paneId: PaneId, command: string): Promise<void> {
  const wtArgs = ['-w', '0', 'split-pane', direction, '--title', name]
  if (direction === '-V') wtArgs.push('--size', '0.7')
  // Platform-specific command wrapping
  if (process.platform === 'win32') {
    wtArgs.push('cmd.exe', '/k', command)
  } else {
    wtArgs.push('bash', '-c', command)  // WSL
  }
  await execFileNoThrow(WT_COMMAND, wtArgs)
}
```

**Self-registration pattern** (matches TmuxBackend/ITermBackend):
```typescript
registerWindowsTerminalBackend(WindowsTerminalBackend)
```

---

### 3.2 detection.ts — Windows Terminal Detection (+47 lines)

**Added functions**:

| Function | Purpose | Detection Method |
|----------|---------|------------------|
| `isInWindowsTerminal()` | Check if running inside Windows Terminal | `WT_SESSION` env var |
| `isWtCliAvailable()` | Check if wt.exe is in PATH | `wt.exe -?` (not `--version`, which doesn't exist) |

**Evidence**:
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

**Why `wt.exe -?` not `--version`**: Per official Microsoft docs
(https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments),
`--version` is NOT a documented wt.exe flag. `-?` is the correct help flag.

**Updated `resetDetectionCache()`** to include `isInWindowsTerminalCached`.

---

### 3.3 registry.ts — Backend Registration & Detection Priority (+107/-20 lines)

**New detection priority flow**:

```
Priority 1: Inside tmux          → TmuxBackend (always wins)
Priority 2: In iTerm2 + it2 CLI  → ITermBackend
Priority 3: In Windows Terminal   → WindowsTerminalBackend  ← NEW
Priority 4: tmux available        → TmuxBackend (external session)
Priority 5: Nothing available     → Error with platform-specific instructions
```

**Key additions**:
```typescript
// New registration function
let WindowsTerminalBackendClass: (new () => PaneBackend) | null = null
export function registerWindowsTerminalBackend(backendClass: new () => PaneBackend): void

// Dynamic import
await import('./WindowsTerminalBackend.js')

// Detection block
if (inWindowsTerminal) {
  const wtAvailable = await isWtCliAvailable()
  if (wtAvailable) {
    const backend = createWindowsTerminalBackend()
    // ... cache and return
  }
  // Fallback to tmux if wt.exe not in PATH
}

// getBackendByType updated
case 'windows-terminal':
  return createWindowsTerminalBackend()
```

**Updated install instructions for Windows**:
```
Before: "requires WSL, then sudo apt install tmux"
After:  "Option 1: Windows Terminal (recommended), Option 2: WSL + tmux"
```

**Updated `isInProcessEnabled()`**:
```typescript
const inWT = isInWindowsTerminal()
enabled = !insideTmux && !inITerm2 && !inWT  // WT now counts as pane backend
```

---

### 3.4 types.ts — Type System Updates (+28/-4 lines)

**BackendType expanded**:
```typescript
// Before
export type BackendType = 'tmux' | 'iterm2' | 'in-process'
export type PaneBackendType = 'tmux' | 'iterm2'

// After
export type BackendType = 'tmux' | 'iterm2' | 'windows-terminal' | 'in-process'
export type PaneBackendType = 'tmux' | 'iterm2' | 'windows-terminal'
```

**Type guard updated**:
```typescript
export function isPaneBackend(type: BackendType): type is 'tmux' | 'iterm2' | 'windows-terminal' {
  return type === 'tmux' || type === 'iterm2' || type === 'windows-terminal'
}
```

**TeammateSpawnConfig extended** (decoupling):
```typescript
export type TeammateSpawnConfig = TeammateIdentity & {
  // ... existing fields ...

  /** Custom command to execute instead of Claude binary */
  customCommand?: string

  /** Skip mailbox write for non-Claude processes */
  skipMailbox?: boolean
}
```

---

### 3.5 PaneBackendExecutor.ts — Custom Command Support (+41/-41 lines)

**Before**: Hardcoded Claude binary spawning:
```typescript
const binaryPath = getTeammateCommand()
const teammateArgs = [`--agent-id ...`, `--agent-name ...`, ...]
const spawnCommand = `cd ${workingDir} && env ${envStr} ${binaryPath} ${teammateArgs}`
```

**After**: Supports both Claude and arbitrary commands:
```typescript
let spawnCommand: string
if (config.customCommand) {
  // Custom command mode: direct execution, no Claude flags
  spawnCommand = `cd ${quote([workingDir])} && ${config.customCommand}`
} else {
  // Default mode: spawn Claude with teammate identity (unchanged logic)
  const binaryPath = getTeammateCommand()
  // ... same as before ...
}
```

**Mailbox skip**:
```typescript
if (!config.skipMailbox) {
  await writeToMailbox(config.name, { from: 'team-lead', text: config.prompt, ... }, config.teamName)
}
```

---

## 4. Commit History

| # | Hash | Message |
|---|------|---------|
| 1 | `e8e1e78` | `feat: add Windows Terminal native split-pane backend and decouple pane spawning` |
| 2 | `c953084` | `fix: correct WindowsTerminalBackend per official wt.exe CLI docs` |
| 3 | `5099ba1` | `docs: track wt.exe limitations and custom pane manager proposals` |

---

## 5. Known Limitations (Documented)

See `docs/08-windows-terminal-pane-management.md` for full details.

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| No pane ID returned by wt.exe | Cannot track individual panes | Synthetic IDs |
| No send-keys to existing pane | Cannot interact post-creation | Deferred creation pattern |
| No kill-pane by ID | Cannot programmatically close | Mailbox shutdown request |
| No pane state query | Cannot monitor health | Trust process lifecycle |
| No post-creation color/title API | Cannot update visually | Set at creation time |

**Upstream tracking**: `microsoft/terminal#16568`, `microsoft/terminal#8855`

---

## 6. Build Verification

```
$ npx tsc --noEmit 2>&1 | grep -E "swarm/backends|WindowsTerminal|detection"
(no errors)
```

All new code compiles cleanly. The only pre-existing errors are in `WorkflowTool.ts`
(unrelated to this PR).

---

## 7. Testing Notes

**Cannot be tested in this environment** (Linux, no Windows Terminal).
Testing requires:

- [ ] Windows 10/11 with Windows Terminal installed
- [ ] WSL with Windows Terminal interop
- [ ] Verify `WT_SESSION` env var is detected
- [ ] Verify `wt.exe -?` returns code 0
- [ ] Verify `wt.exe -w 0 split-pane -V --title "test" -- cmd.exe /k echo hello`
- [ ] Verify deferred creation pattern works end-to-end
- [ ] Verify customCommand spawns non-Claude tools correctly
