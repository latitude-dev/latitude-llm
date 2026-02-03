import { proxyActivity } from '../../shared'
import type * as handler from './handler'

export const {
  fetchExperimentDataActivityHandler: fetchExperimentDataActivity,
} = proxyActivity<typeof handler>({
  queue: 'main',
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '1 minute',
})
