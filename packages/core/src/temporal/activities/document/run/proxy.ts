import { proxyActivity } from '../../shared'
import type * as handler from './handler'

export const { runDocumentActivityHandler: runDocumentActivity } =
  proxyActivity<typeof handler>({
    queue: 'runs',
    startToCloseTimeout: '10 minutes',
    heartbeatTimeout: '2 minutes',
  })
