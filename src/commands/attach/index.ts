import type { Command } from '../../commands.js'

const attach = {
  type: 'local',
  name: 'attach',
  description: 'Attach to another CLI terminal as master (forward input to remote slave)',
  argumentHint: '<pipe-name>',
  supportsNonInteractive: false,
  load: () => import('./attach.js'),
} satisfies Command

export default attach
