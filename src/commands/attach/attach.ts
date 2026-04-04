import type { LocalCommandCall } from '../../types/command.js'
import { connectToPipe, type PipeClient, type PipeMessage } from '../../utils/pipeTransport.js'
import { setMasterPipeClient } from '../../hooks/useMasterRelay.js'

export const call: LocalCommandCall = async (args, context) => {
  const targetName = args.trim()
  if (!targetName) {
    return {
      type: 'text',
      value: 'Usage: /attach <pipe-name>\nUse /pipes to list available pipes.',
    }
  }

  const currentState = context.getAppState()
  if (currentState.pipeIpc.role === 'master') {
    return {
      type: 'text',
      value: `Already attached to "${currentState.pipeIpc.attachedTo}". Use /detach first.`,
    }
  }

  // Connect to the target pipe server
  let client: PipeClient
  try {
    const myName = currentState.pipeIpc.serverName ?? `master-${process.pid}`
    client = await connectToPipe(targetName, myName)
  } catch (err) {
    return {
      type: 'text',
      value: `Failed to connect to "${targetName}": ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Send attach request and wait for response
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      client.disconnect()
      resolve({
        type: 'text',
        value: `Attach to "${targetName}" timed out (no response within 5s).`,
      })
    }, 5000)

    client.onMessage((msg: PipeMessage) => {
      if (msg.type === 'attach_accept') {
        clearTimeout(timeout)

        // Store client reference at module level for useMasterRelay
        setMasterPipeClient(client)

        // Update AppState
        context.setAppState((prev) => ({
          ...prev,
          pipeIpc: {
            ...prev.pipeIpc,
            role: 'master',
            attachedTo: targetName,
          },
        }))

        resolve({
          type: 'text',
          value: `Attached to "${targetName}". Your input will be forwarded to the remote CLI.\nUse /detach to return to local mode.`,
        })
      } else if (msg.type === 'attach_reject') {
        clearTimeout(timeout)
        client.disconnect()
        setMasterPipeClient(null)

        resolve({
          type: 'text',
          value: `Attach rejected by "${targetName}": ${msg.data ?? 'unknown reason'}`,
        })
      }
    })

    client.send({ type: 'attach_request' })
  })
}
