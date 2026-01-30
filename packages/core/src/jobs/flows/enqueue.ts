import { FlowJob } from 'bullmq'
import { Result, TypedResult } from '../../lib/Result'
import { UnprocessableEntityError } from '../../lib/errors'
import { flowProducer } from './index'
import { EnqueuedFlow } from './types'

/**
 * Enqueues a flow and returns a Result.
 * The flow is added atomically - either all jobs are added or none.
 */
export async function enqueueFlow(
  flow: FlowJob,
): Promise<TypedResult<EnqueuedFlow, Error>> {
  const producer = await flowProducer()

  const { job } = await producer.add(flow)

  if (!job.id) {
    return Result.error(
      new UnprocessableEntityError('Failed to enqueue flow: job ID is empty'),
    )
  }

  return Result.ok({
    flowJobId: flow.opts?.jobId ?? job.id,
    rootJobId: job.id,
  })
}

/**
 * Enqueues multiple flows in bulk.
 * Each flow is added atomically.
 */
export async function enqueueFlows(
  flows: FlowJob[],
): Promise<TypedResult<EnqueuedFlow[], Error>> {
  const producer = await flowProducer()

  const results = await producer.addBulk(flows)

  const enqueuedFlows: EnqueuedFlow[] = []
  for (let i = 0; i < results.length; i++) {
    const { job } = results[i]!
    if (!job.id) {
      return Result.error(
        new UnprocessableEntityError(`Failed to enqueue flow at index ${i}`),
      )
    }
    enqueuedFlows.push({
      flowJobId: flows[i]!.opts?.jobId ?? job.id,
      rootJobId: job.id,
    })
  }

  return Result.ok(enqueuedFlows)
}
