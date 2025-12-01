import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { FlowProducer } from 'bullmq'
import { REDIS_KEY_PREFIX } from '@latitude-data/core/redis'
import { buildRedisConnection } from '@latitude-data/core/redis'
import { env } from '@latitude-data/env'
import { Queues } from '../../../jobs/queues/types'
import { Result } from '@latitude-data/core/lib/Result'
import { EvaluationV2 } from '@latitude-data/constants'
import { Span } from '@latitude-data/constants'

export async function createEvaluationFlow({
  workspace,
  commit,
  documentUuid,
  spanAndTraceIdPairsOfPositiveEvaluationRuns,
  spanAndTraceIdPairsOfNegativeEvaluationRuns,
  evaluationToEvaluate,
  spans,
}: {
  workspace: Workspace
  commit: Commit
  documentUuid: string
  spanAndTraceIdPairsOfPositiveEvaluationRuns: {
    spanId: string
    traceId: string
  }[]
  spanAndTraceIdPairsOfNegativeEvaluationRuns: {
    spanId: string
    traceId: string
  }[]
  evaluationToEvaluate: EvaluationV2
  spans: Span[]
}) {
  const flowProducer = new FlowProducer({
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
    }),
  })

  const { job } = await flowProducer.add({
    name: `calculateQualityMetricJob`,
    queueName: Queues.generateEvaluationsQueue,
    data: {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluationToEvaluate.uuid,
      documentUuid,
      spanAndTraceIdPairsOfPositiveEvaluationRuns,
      spanAndTraceIdPairsOfNegativeEvaluationRuns,
    },
    opts: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
    children: spans.map((span) => ({
      name: `runEvaluationV2Job`,
      queueName: Queues.evaluationsQueue,
      data: {
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluationToEvaluate.uuid,
        spanId: span.id,
        traceId: span.traceId,
        dry: true,
      },
      opts: {
        // overriding eval queue options for faster retry policy to avoid user waiting too long for the evaluation to be generated
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 1000,
        },
      },
    })),
  })
  if (!job.id) {
    return Result.error(
      new Error('Failed to create evaluation validation flow'),
    )
  }
  return Result.ok({ job })
}
