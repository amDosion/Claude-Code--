import type { LocalCommandCall } from '../../types/command.js'
import { getMasterPipeClient, setMasterPipeClient } from '../../hooks/useMasterRelay.js'

export const call: LocalCommandCall = async (_args, context) => {
  const currentState = context.getAppState()

  if (currentState.pipeIpc.role === 'standalone') {
    return { type: 'text', value: 'Not attached to any remote CLI.' }
  }

  if (currentState.pipeIpc.role === 'slave') {
    return {
      type: 'text',
      value:
        'This terminal is in slave mode (controlled by a remote master). The master must detach.',
    }
  }

  // Master mode — send detach and disconnect
  const client = getMasterPipeClient()
  if (client) {
    try {
      client.send({ type: 'detach' })
    } catch {
      // Socket may already be closed
    }
    client.disconnect()
    setMasterPipeClient(null)
  }

  const target = currentState.pipeIpc.attachedTo

  context.setAppState((prev) => ({
    ...prev,
    pipeIpc: {
      ...prev.pipeIpc,
      role: 'standalone',
      attachedTo: null,
    },
  }))

  return {
    type: 'text',
    value: `Detached from "${target}". Back to local mode.`,
  }
}
