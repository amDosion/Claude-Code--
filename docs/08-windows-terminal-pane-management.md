# Windows Terminal Pane Management: Limitations & Custom Solution Proposal

## Status: TRACKING

> **Related upstream issue**: [microsoft/terminal#16568](https://github.com/microsoft/terminal/issues/16568) — Expose an API for modifying components of Windows Terminal
> **Related upstream issue**: [microsoft/terminal#8855](https://github.com/microsoft/terminal/issues/8855) — Ability to create new tabs/panes from scripts in current session

---

## Problem Statement

Windows Terminal (`wt.exe`) is the default terminal on modern Windows, but its CLI
has **fundamental architectural gaps** that prevent full pane lifecycle management.
Our `WindowsTerminalBackend` currently works around these limitations with a
deferred-creation pattern, but critical operations remain impossible.

## wt.exe CLI Limitations (as of 2026-04)

### What works

| Capability | CLI Syntax | Status |
|---|---|---|
| Create split pane | `wt.exe -w 0 split-pane -V\|-H` | OK |
| Set pane title | `split-pane --title "name"` | OK |
| Set pane size | `split-pane --size 0.7` | OK |
| Set working directory | `split-pane -d "C:\path"` | OK |
| Run command in pane | `split-pane -- command args` | OK |
| Move focus by direction | `move-focus --direction up\|down\|left\|right` | OK |
| Swap panes by direction | `swap-pane --direction up\|down\|left\|right` | OK |

### What is MISSING (blocking full pane management)

| Capability | Impact | Severity |
|---|---|---|
| **No pane ID returned** on creation | Cannot track individual panes | CRITICAL |
| **No list-panes command** | Cannot discover existing panes | CRITICAL |
| **No send-keys / send-command** to existing pane | Cannot interact post-creation | CRITICAL |
| **No kill-pane by ID** | Cannot programmatically close panes | HIGH |
| **No pane state query** (alive/dead/PID) | Cannot monitor pane health | HIGH |
| **No pane resize by ID** | Cannot rebalance layouts | MEDIUM |
| **No pane color API** (split-pane has no --tabColor) | No visual differentiation | LOW |
| **No pane title update** post-creation | Cannot reflect state changes | LOW |
| **No hide/show pane** equivalent | Cannot implement pane parking | LOW |
| **No JSON/REST/WebSocket API** for runtime control | No programmatic alternative | CRITICAL |

## Current Workaround (WindowsTerminalBackend)

```
createTeammatePaneInSwarmView()
  → generates synthetic pane ID
  → stores metadata (name, color, direction)
  → returns immediately (DEFERRED)

sendCommandToPane(paneId, command)
  → retrieves stored metadata
  → executes: wt.exe -w 0 split-pane {direction} --title {name} --size {size} -- {command}
  → the pane is created WITH the command baked in
  → pane ID is removed from deferred registry

killPane(paneId)
  → cleans up internal tracking only
  → actual pane closes when process inside exits (via mailbox shutdown)
```

**Consequences of workaround**:
- No way to verify a pane was actually created
- No way to detect if a pane has crashed
- No way to send follow-up commands
- Kill relies on graceful process exit

---

## Proposed Solution: Custom Pane Manager for Windows Terminal

Since Microsoft has not prioritized the pane management API (issue filed since 2021),
we should consider building our own solution. There are several approaches:

### Option A: ConPTY-Based Pane Manager (Recommended)

Build a lightweight native helper (`claude-wt-manager.exe`) that:

1. **Creates panes** via ConPTY (Console Pseudo Terminal) API directly
2. **Assigns and tracks pane IDs** internally
3. **Multiplexes I/O** — sends input to specific panes, captures output
4. **Reports pane health** — monitors process handles
5. **Provides a CLI interface** for Claude to call:
   ```
   claude-wt-manager create --direction V --title "researcher" --size 0.7
   → returns: {"paneId": "abc-123", "pid": 4567}
   
   claude-wt-manager send --pane abc-123 --command "echo hello"
   claude-wt-manager list
   claude-wt-manager kill --pane abc-123
   claude-wt-manager resize --pane abc-123 --size 0.5
   ```

**Pros**: Full control, no dependency on wt.exe CLI limitations
**Cons**: Requires compiling a native Windows binary, non-trivial ConPTY integration

### Option B: Windows Terminal Settings Injection

Manipulate Windows Terminal's `settings.json` and use `wt.exe` command chaining:

1. **Pre-define profiles** with unique GUIDs for each teammate
2. **Use `split-pane -p {profile-guid}`** to create typed panes
3. **Track by profile** — each profile has a unique startup command
4. **Monitor via process tree** — find child processes of the Windows Terminal PID

**Pros**: No native code needed
**Cons**: Fragile, settings file conflicts, no send-keys equivalent

### Option C: Named Pipe IPC Bridge

Each pane runs a small IPC agent that listens on a named pipe:

1. **Pane startup**: `claude-pane-agent.exe --pipe \\.\pipe\claude-pane-{id}`
2. **Parent queries** pane agent via named pipe for status, sends commands
3. **Agent forwards** received commands to the shell process
4. **Agent reports** process health, exit codes

**Pros**: Works with existing wt.exe CLI, cross-process communication
**Cons**: Requires distributing additional binary, startup overhead

### Option D: Windows Terminal Fragment Extensions

Windows Terminal supports [JSON fragment extensions](https://learn.microsoft.com/en-us/windows/terminal/json-fragment-extensions)
that can inject profiles dynamically. Combined with a startup hook:

1. **Install a fragment** that defines teammate profiles
2. **Each profile** runs a specific command with a known named pipe
3. **Parent communicates** via the named pipe

**Pros**: No settings.json modification, clean integration
**Cons**: Still no pane ID or send-keys, fragments are profile-only

---

## Recommendation

**Short-term** (current): Keep the deferred-creation workaround with mailbox-based
communication. It works for the basic swarm use case.

**Medium-term**: Implement **Option C (Named Pipe IPC Bridge)** as it provides the
best balance of capability and implementation effort. The pipe agent can be a small
Node.js script (no native compilation needed), and it enables:
- Pane health monitoring
- Command injection to existing panes
- Graceful shutdown with confirmation

**Long-term**: Implement **Option A (ConPTY-Based Pane Manager)** for full control.
This would make the Windows experience on par with tmux. Could potentially be
extracted as a standalone open-source project ("wtmux" — a tmux-like layer for
Windows Terminal via ConPTY).

---

## Implementation Tracking

- [x] WindowsTerminalBackend basic implementation (deferred creation pattern)
- [x] Detection: WT_SESSION env var + wt.exe -? availability check
- [x] Registry: Priority 3 in backend detection flow
- [x] PaneBackendExecutor: customCommand/skipMailbox for non-Claude tools
- [ ] Named Pipe IPC agent prototype
- [ ] ConPTY pane manager research & feasibility study
- [ ] Cross-process pane health monitoring
- [ ] Integration test on Windows + WSL

## References

- [Windows Terminal CLI docs](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)
- [Windows Terminal Panes docs](https://learn.microsoft.com/en-us/windows/terminal/panes)
- [ConPTY API](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session)
- [microsoft/terminal#16568](https://github.com/microsoft/terminal/issues/16568) — Pane management API request
- [microsoft/terminal#8855](https://github.com/microsoft/terminal/issues/8855) — Script-based tab/pane creation
- [JSON Fragment Extensions](https://learn.microsoft.com/en-us/windows/terminal/json-fragment-extensions)
