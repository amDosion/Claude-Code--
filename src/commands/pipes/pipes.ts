import type { LocalCommandCall } from '../../types/command.js'
import { listPipes, isPipeAlive } from '../../utils/pipeTransport.js'

export const call: LocalCommandCall = async (_args, context) => {
  const currentState = context.getAppState()
  const myName = currentState.pipeIpc.serverName
  const role = currentState.pipeIpc.role

  const allPipes = await listPipes()

  const lines: string[] = []

  // Show own pipe name and status
  lines.push(`Your pipe:  ${myName ?? '(not started)'}`)
  lines.push(`Role:       ${role}`)

  if (role === 'master') {
    lines.push(`Attached to: ${currentState.pipeIpc.attachedTo}`)
  } else if (role === 'slave') {
    lines.push(`Controlled by: ${currentState.pipeIpc.attachedBy}`)
  }

  lines.push('')

  // List other pipes with liveness check
  const otherPipes = allPipes.filter((p) => p !== myName)
  if (otherPipes.length === 0) {
    lines.push('No other pipes found.')
  } else {
    lines.push(`Other pipes (${otherPipes.length}):`)
    for (const name of otherPipes) {
      const alive = await isPipeAlive(name)
      const status = alive ? 'alive' : 'stale'
      lines.push(`  ${name}  [${status}]`)
    }
  }

  lines.push('')
  lines.push('To attach: /attach <pipe-name>')

  return { type: 'text', value: lines.join('\n') }
}
