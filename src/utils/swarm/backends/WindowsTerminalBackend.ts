import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import { logForDebugging } from '../../../utils/debug.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { sleep } from '../../sleep.js'
import { isInWindowsTerminal, isWtCliAvailable, WT_COMMAND } from './detection.js'
import { registerWindowsTerminalBackend } from './registry.js'
import type { CreatePaneResult, PaneBackend, PaneId } from './types.js'

/**
 * Tracks created panes by their synthetic ID.
 * Windows Terminal doesn't provide pane IDs (see microsoft/terminal#16568),
 * so we generate synthetic IDs and associate them with metadata for
 * deferred pane creation.
 */
type DeferredPane = {
  name: string
  color: AgentColorName
  direction: '-V' | '-H'
}

// Track panes by synthetic ID
const paneRegistry = new Map<string, DeferredPane>()

// Track total pane count for layout decisions
let paneCount = 0

// Lock mechanism to prevent race conditions when spawning teammates in parallel
let paneCreationLock: Promise<void> = Promise.resolve()

// Delay after pane creation to allow shell initialization.
// Slightly longer than tmux (200ms) because wt.exe spawns a new conhost process.
const PANE_SHELL_INIT_DELAY_MS = 500

function waitForPaneShellReady(): Promise<void> {
  return sleep(PANE_SHELL_INIT_DELAY_MS)
}

/**
 * Acquires a lock for pane creation, ensuring sequential execution.
 * Returns a release function that must be called when done.
 */
function acquirePaneCreationLock(): Promise<() => void> {
  let release: () => void
  const newLock = new Promise<void>(resolve => {
    release = resolve
  })

  const previousLock = paneCreationLock
  paneCreationLock = newLock

  return previousLock.then(() => release!)
}

/**
 * Generates a synthetic pane ID since Windows Terminal doesn't provide them.
 */
function generatePaneId(): string {
  return `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * WindowsTerminalBackend implements PaneBackend using Windows Terminal's
 * native split-pane functionality via the wt.exe CLI.
 *
 * Reference: https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments
 *
 * Key design decisions:
 *
 * 1. DEFERRED PANE CREATION: Windows Terminal's `wt.exe split-pane` requires
 *    the command at creation time (unlike tmux where you create a pane then
 *    send commands to it). So createTeammatePaneInSwarmView() returns a
 *    synthetic pane ID, and sendCommandToPane() actually creates the split
 *    pane with the command baked in.
 *
 * 2. NO PANE IDS: Windows Terminal doesn't expose pane IDs through its CLI.
 *    (See microsoft/terminal#16568 for the feature request.)
 *    We generate synthetic IDs for internal tracking only.
 *
 * 3. LIMITED POST-CREATION MANAGEMENT: After creation, we cannot query pane
 *    state, send new commands, resize programmatically, or kill individual
 *    panes. Windows Terminal handles its own layout. Available post-creation
 *    operations are limited to directional navigation:
 *    - move-focus --direction {up|down|left|right|first|previous|...}
 *    - swap-pane --direction {up|down|left|right|...}
 *
 * 4. CROSS-PLATFORM: Works on both native Windows and WSL (via Windows interop).
 *    On WSL, wt.exe is accessible through the /mnt/c path or directly in PATH.
 *
 * 5. SPLIT-PANE CLI FLAGS (official):
 *    - `-H` / `--horizontal`: New pane below
 *    - `-V` / `--vertical`: New pane to the right
 *    - `-s` / `--size`: Decimal fraction of available space (0.0-1.0)
 *    - `--title`: Custom pane title
 *    - `-d` / `--startingDirectory`: Working directory
 *    - `-p` / `--profile`: Terminal profile name or GUID
 *    Note: `--tabColor` and `--colorScheme` are new-tab flags only,
 *    NOT available on split-pane.
 *
 * Layout strategy:
 * - First pane: vertical split (-V, --size 0.7) to create left/right layout
 *   with leader on left (30%) and teammate on right (70%)
 * - Subsequent panes: horizontal splits (-H) from right side to stack vertically
 * - All panes target the current window (-w 0)
 */
export class WindowsTerminalBackend implements PaneBackend {
  readonly type = 'windows-terminal' as const
  readonly displayName = 'Windows Terminal'
  readonly supportsHideShow = false

  async isAvailable(): Promise<boolean> {
    return isWtCliAvailable()
  }

  async isRunningInside(): Promise<boolean> {
    return isInWindowsTerminal()
  }

  /**
   * Creates a new teammate pane in the swarm view.
   *
   * Due to Windows Terminal's CLI design, actual pane creation is deferred
   * to sendCommandToPane(). This method registers the pane and returns
   * a synthetic ID.
   */
  async createTeammatePaneInSwarmView(
    name: string,
    color: AgentColorName,
  ): Promise<CreatePaneResult> {
    const releaseLock = await acquirePaneCreationLock()

    try {
      const paneId = generatePaneId()
      const isFirstTeammate = paneCount === 0

      // Determine split direction:
      // First teammate: vertical split (creates left/right layout with leader)
      // Subsequent: horizontal splits (stack vertically on the right side)
      const direction = isFirstTeammate ? '-V' : '-H'

      paneRegistry.set(paneId, { name, color, direction })
      paneCount++

      logForDebugging(
        `[WindowsTerminalBackend] Registered pane for ${name}: ${paneId} (direction=${direction})`,
      )

      return { paneId, isFirstTeammate }
    } finally {
      releaseLock()
    }
  }

  /**
   * Sends a command to a specific pane.
   *
   * For Windows Terminal, this is where the actual split-pane creation happens.
   * The command is executed directly in the new pane via `wt.exe -w 0 split-pane`.
   *
   * After the initial creation, subsequent calls for the same pane are no-ops
   * since Windows Terminal doesn't support sending commands to existing panes
   * (no equivalent to tmux send-keys or iTerm2 session run).
   */
  async sendCommandToPane(
    paneId: PaneId,
    command: string,
    _useExternalSession?: boolean,
  ): Promise<void> {
    const paneInfo = paneRegistry.get(paneId)

    if (!paneInfo) {
      logForDebugging(
        `[WindowsTerminalBackend] sendCommandToPane: pane ${paneId} not found in registry, treating as already created`,
      )
      return
    }

    const { name, direction } = paneInfo

    // Build wt.exe split-pane command
    // Reference: https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments
    //
    // -w 0: target the most recent window (current window)
    // split-pane: create a new pane by splitting
    // --title: set the pane title (visible in Windows Terminal UI)
    // --size: decimal fraction of available space for the new pane
    //
    // Note: --tabColor is a new-tab flag only, NOT available on split-pane.
    // Pane identification relies on --title since wt.exe has no pane ID system.
    const wtArgs = [
      '-w',
      '0',
      'split-pane',
      direction,
      '--title',
      name,
    ]

    // First pane gets 70% of space (leader keeps 30%)
    if (direction === '-V') {
      wtArgs.push('--size', '0.7')
    }

    // Pass the command to execute in the new pane.
    //
    // The PaneBackendExecutor builds the full spawn command including:
    //   cd <workingDir> && env KEY=VAL ... claude --agent-id ...
    // (or a customCommand for non-Claude tools)
    //
    // On native Windows (win32): wrap in cmd.exe /k to keep pane alive
    //   after command completion and for proper shell interpretation.
    // On WSL: wrap in bash -c since the command contains shell constructs
    //   (cd, &&, env vars). wt.exe on WSL creates a new WSL pane by default.
    if (process.platform === 'win32') {
      // cmd.exe /k runs command and stays open (unlike /c which closes)
      wtArgs.push('cmd.exe', '/k', command)
    } else {
      // On WSL, bash -c interprets the compound command string
      wtArgs.push('bash', '-c', command)
    }

    logForDebugging(
      `[WindowsTerminalBackend] Creating split pane: wt.exe ${wtArgs.join(' ')}`,
    )

    const result = await execFileNoThrow(WT_COMMAND, wtArgs)

    if (result.code !== 0) {
      throw new Error(
        `Failed to create Windows Terminal split pane for ${name}: ${result.stderr}`,
      )
    }

    // Remove from deferred registry - pane is now created
    paneRegistry.delete(paneId)

    logForDebugging(
      `[WindowsTerminalBackend] Created split pane for ${name}: ${paneId}`,
    )

    // Wait for shell to initialize in the new pane
    await waitForPaneShellReady()
  }

  /**
   * No-op for Windows Terminal.
   * There is no post-creation API to change pane border colors.
   * Color differentiation can only be done at pane creation time via
   * terminal profile color schemes.
   */
  async setPaneBorderColor(
    _paneId: PaneId,
    _color: AgentColorName,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Windows Terminal has no API to change pane colors after creation
  }

  /**
   * No-op for Windows Terminal.
   * Pane titles are set during creation via --title flag.
   * There is no post-creation API to change pane titles.
   */
  async setPaneTitle(
    _paneId: PaneId,
    _name: string,
    _color: AgentColorName,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Title is set during pane creation via --title
  }

  /**
   * No-op for Windows Terminal.
   * Windows Terminal shows pane titles in its native UI automatically.
   */
  async enablePaneBorderStatus(
    _windowTarget?: string,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Windows Terminal shows pane information natively
  }

  /**
   * No-op for Windows Terminal.
   * Windows Terminal manages its own pane layout automatically.
   * Users can manually resize panes with Alt+Shift+Arrow keys.
   * Programmatic pane resizing is not available via wt.exe CLI.
   */
  async rebalancePanes(
    _windowTarget: string,
    _hasLeader: boolean,
  ): Promise<void> {
    logForDebugging(
      '[WindowsTerminalBackend] Pane rebalancing delegated to Windows Terminal',
    )
  }

  /**
   * Attempts to close a pane.
   *
   * Windows Terminal doesn't provide a CLI to kill specific panes
   * (no pane ID system, see microsoft/terminal#16568).
   * We can only clean up internal tracking state.
   * The actual pane closes when the process inside it exits, either:
   * - Via mailbox shutdown request (graceful)
   * - When the user manually closes it (Ctrl+Shift+W)
   */
  async killPane(
    paneId: PaneId,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    // Clean up internal state
    const existed = paneRegistry.delete(paneId)
    if (existed) {
      paneCount = Math.max(0, paneCount - 1)
    }

    logForDebugging(
      `[WindowsTerminalBackend] killPane ${paneId}: cleaned up tracking (actual pane closes when process exits)`,
    )

    // Return true - the pane will close when the process receives
    // a shutdown request via the mailbox system
    return true
  }

  /**
   * Not supported in Windows Terminal.
   * There is no equivalent to tmux's break-pane / join-pane.
   */
  async hidePane(
    _paneId: PaneId,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    logForDebugging(
      '[WindowsTerminalBackend] hidePane not supported in Windows Terminal',
    )
    return false
  }

  /**
   * Not supported in Windows Terminal.
   * There is no equivalent to tmux's break-pane / join-pane.
   */
  async showPane(
    _paneId: PaneId,
    _targetWindowOrPane: string,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    logForDebugging(
      '[WindowsTerminalBackend] showPane not supported in Windows Terminal',
    )
    return false
  }
}

// Register the backend with the registry when this module is imported.
// eslint-disable-next-line custom-rules/no-top-level-side-effects
registerWindowsTerminalBackend(WindowsTerminalBackend)
