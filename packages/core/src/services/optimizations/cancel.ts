import {
  OPTIMIZATION_CANCEL_TIMEOUT,
  OPTIMIZATION_CANCELLED_ERROR,
} from '@latitude-data/constants/optimizations'
import { env } from '@latitude-data/env'
import { Queue, QueueEvents } from 'bullmq'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { Queues } from '../../jobs/queues/types'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../../redis'
import { ExperimentsRepository } from '../../repositories'
import { Optimization } from '../../schema/models/types/Optimization'
import { type Workspace } from '../../schema/models/types/Workspace'
import { stopExperiment } from '../experiments/stop'
import { endOptimization } from './end'

export async function cancelOptimization(
  {
    optimization,
    workspace,
  }: {
    optimization: Optimization
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  if (optimization.finishedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already ended'),
    )
  }

  const { optimizationsQueue } = await queues()
  if (!optimization.preparedAt) {
    await stopAndWaitJob({
      jobId: `${optimization.uuid}-prepareOptimizationJob`,
      queue: optimizationsQueue,
    })
  } else if (!optimization.executedAt) {
    await stopAndWaitJob({
      jobId: `${optimization.uuid}-executeOptimizationJob`,
      queue: optimizationsQueue,
    })
  } else if (!optimization.validatedAt) {
    await stopAndWaitJob({
      jobId: `${optimization.uuid}-validateOptimizationJob`,
      queue: optimizationsQueue,
    })

    await stopExperiments({ optimization, workspace })
  }

  return await transaction.call(async () => {
    const ending = await endOptimization(
      {
        error: OPTIMIZATION_CANCELLED_ERROR,
        optimization: optimization,
        workspace: workspace,
      },
      transaction,
    )
    if (ending.error) {
      return Result.error(ending.error)
    }
    optimization = ending.value.optimization

    return Result.ok({ optimization })
  })
}

const JOB_FINISHED_STATES = ['completed', 'failed', 'unknown']

let subscription: QueueEvents | undefined
async function subscribeQueue() {
  if (subscription) return subscription

  subscription = new QueueEvents(Queues.optimizationsQueue, {
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
      maxRetriesPerRequest: 0,
    }),
  })

  return subscription
}

async function stopAndWaitJob({
  jobId,
  queue,
}: {
  jobId: string
  queue: Queue
}) {
  const job = await queue.getJob(jobId)
  if (!job?.id) return

  let state
  try {
    state = await job.getState()
  } catch {
    /* No-op */
  }

  if (state && !JOB_FINISHED_STATES.includes(state)) {
    publisher.publish('cancelJob', { jobId: job.id })

    try {
      const subscription = await subscribeQueue()
      await job.waitUntilFinished(subscription, OPTIMIZATION_CANCEL_TIMEOUT)
    } catch {
      /* No-op */
    }
  }

  try {
    await job.remove()
  } catch {
    /* No-op */
  }
}

async function stopExperiments({
  optimization,
  workspace,
}: {
  optimization: Optimization
  workspace: Workspace
}) {
  try {
    const repository = new ExperimentsRepository(workspace.id)

    if (optimization.baselineExperimentId) {
      const experiment = await repository
        .find(optimization.baselineExperimentId)
        .then((r) => r.unwrap())

      await stopExperiment({
        experiment: experiment,
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
    }

    if (optimization.optimizedExperimentId) {
      const experiment = await repository
        .find(optimization.optimizedExperimentId)
        .then((r) => r.unwrap())

      await stopExperiment({
        experiment: experiment,
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
    }
  } catch {
    /* No-op */
  }
}
