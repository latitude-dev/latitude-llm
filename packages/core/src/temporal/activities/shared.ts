import type { RetryPolicy, UntypedActivities } from '@temporalio/client'
import {
  type ActivityInterfaceFor,
  type ActivityOptions,
  proxyActivities,
} from '@temporalio/workflow'
import { TemporalQueue } from '../queues'

export const defaultRetryPolicy: RetryPolicy = {
  maximumAttempts: 3,
  initialInterval: '1s',
  maximumInterval: '30s',
  backoffCoefficient: 2,
}

export function proxyActivity<A extends UntypedActivities>(
  options: Omit<ActivityOptions, 'taskQueue'> & { queue: TemporalQueue },
): ActivityInterfaceFor<A> {
  const { queue, retry, ...rest } = options
  return proxyActivities<A>({
    taskQueue: queue,
    retry: retry ?? defaultRetryPolicy,
    ...rest,
  })
}
