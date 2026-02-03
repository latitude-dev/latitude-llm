import { proxyActivity } from '../../shared'
import type * as handler from './handler'

export const { waitForSpanActivityHandler: waitForSpanActivity } =
  proxyActivity<typeof handler>({
    queue: 'tracing',
    startToCloseTimeout: '5 minutes',
    heartbeatTimeout: '30s',
  })
