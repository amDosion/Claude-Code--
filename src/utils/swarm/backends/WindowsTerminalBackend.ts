import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import { logForDebugging } from '../../../utils/debug.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { sleep } from '../../sleep.js'
import { isInWindowsTerminal, isWtCliAvailable, WT_COMMAND } from './detection.js'
import { registerWindowsTerminalBackend } from './registry.js'
import type { CreatePaneResult, PaneBackend, PaneId } from './types.js'

/**
 * Tracks created panes by their synthetic ID.
 * Windows Terminal doesn't provide pane IDs, so we generate UUIDs
 * and associate them with the command that was deferred for execution.
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

// Delay after pane creation to allow shell initialization
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
 * Maps agent colors to Windows Terminal ANSI color names for --tabColor.
 * Windows Terminal supports hex colors for tab coloring.
 */
function getWtTabColor(color: AgentColorName): string {
  const wtColors: Record<AgentColorName, string> = {
    red: '#FF0000',
    blue: '#0078D7',
    green: '#00CC6A',
    yellow: '#FFB900',
    purple: '#B4009E',
    orange: '#FF8C00',
    pink: '#E74856',
    cyan: '#00B7C3',
  }
  return wtColors[color]
}

/**
 * WindowsTerminalBackend implements PaneBackend using Windows Terminal's
 * native split-pane functionality via the wt.exe CLI.
 *
 * Key design decisions:
 *
 * 1. DEFERRED PANE CREATION: Windows Terminal's `wt.exe split-pane` requires
 *    the command at creation time (unlike tmux where you create a pane then
 *    send commands). So createTeammatePaneInSwarmView() returns a synthetic
 *    pane ID, and sendCommandToPane() actually creates the split pane with
 *    the command.
 *
 * 2. NO PANE IDS: Windows Terminal doesn't expose pane IDs through its CLI.
 *    We generate synthetic IDs for internal tracking.
 *
 * 3. LIMITED PANE MANAGEMENT: After creation, we can't query pane state,
 *    resize, or rebalance. Windows Terminal handles its own layout.
 *
 * 4. CROSS-PLATFORM: Works on both native Windows and WSL (via Windows interop).
 *    On WSL, wt.exe is accessible through the /mnt/c path or directly in PATH.
 *
 * Architecture:
 * - First pane: vertical split (-V) to create left/right layout
 * - Subsequent panes: alternate horizontal (-H) splits to stack on the right
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
   * since Windows Terminal doesn't support sending commands to existing panes.
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

    const { name, color, direction } = paneInfo
    const tabColor = getWtTabColor(color)

    // Build wt.exe split-pane command
    // -w 0: target the current/most-recent window
    // --title: set the pane/tab title
    // --tabColor: set the tab color indicator
    // --size 0.7: first pane gets 70% width (leader keeps 30%)
    const wtArgs = [
      '-w',
      '0',
      'split-pane',
      direction,
      '--title',
      name,
      '--tabColor',
      tabColor,
    ]

    // First pane gets 70% of space (leader keeps 30%)
    if (direction === '-V') {
      wtArgs.push('--size', '0.7')
    }

    // The command needs to be passed as shell execution since wt.exe
    // split-pane runs the command directly.
    // On Windows: use cmd.exe /k to keep the pane open after command exits
    // On WSL: use the command directly (wt.exe handles WSL interop)
    if (process.platform === 'win32') {
      wtArgs.push('cmd.exe', '/k', command)
    } else {
      // On WSL, we need to wrap in bash -c for proper shell interpretation
      // since the command may contain env vars, pipes, etc.
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

    // Wait for shell to initialize
    await waitForPaneShellReady()
  }

  /**
   * No-op for Windows Terminal.
   * Tab/pane colors are set during creation via --tabColor.
   */
  async setPaneBorderColor(
    _paneId: PaneId,
    _color: AgentColorName,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Color is set during pane creation via --tabColor
  }

  /**
   * No-op for Windows Terminal.
   * Pane titles are set during creation via --title.
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
   * Windows Terminal always shows pane titles in its UI.
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
   * Windows Terminal doesn't provide a CLI to kill specific panes by ID.
   * Since we use synthetic IDs, we can only clean up our internal tracking.
   * The actual pane closes when the process inside it exits (e.g., via
   * mailbox shutdown request).
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

    // Return true since we cleaned up - the pane will close when the
    // process inside it receives a shutdown request via mailbox
    return true
  }

  /**
   * Not supported in Windows Terminal.
   * Windows Terminal doesn't support hiding/showing individual panes.
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
   * Windows Terminal doesn't support hiding/showing individual panes.
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
