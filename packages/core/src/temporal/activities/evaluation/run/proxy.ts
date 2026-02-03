import { proxyActivity } from '../../shared'
import type * as handler from './handler'

export const { runEvaluationActivityHandler: runEvaluationActivity } =
  proxyActivity<typeof handler>({
    queue: 'evaluations',
    startToCloseTimeout: '10 minutes',
    heartbeatTimeout: '2 minutes',
  })
