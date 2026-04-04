import type { Command } from '../../commands.js'

const detach = {
  type: 'local',
  name: 'detach',
  description: 'Detach from the remote CLI and return to local mode',
  supportsNonInteractive: false,
  load: () => import('./detach.js'),
} satisfies Command

export default detach
