import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { FlowProducer } from 'bullmq'
import { REDIS_KEY_PREFIX } from '@latitude-data/core/redis'
import { buildRedisConnection } from '@latitude-data/core/redis'
import { env } from '@latitude-data/env'
import { Queues } from '../../../jobs/queues/types'
import { Result } from '@latitude-data/core/lib/Result'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  Span,
} from '@latitude-data/constants'
import { Issue } from '../../../schema/models/types/Issue'
import { database } from '../../../client'
import { getEqualAmountsOfPositiveAndNegativeExamples } from './getEqualAmountsOfPositiveAndNegativeExamples'
import { generateConfigurationHash } from '../generateConfigurationHash'

/*
  This function creates a BullMQ flow to recalculate the alignment metric of an evaluation.

  To do this, it finds a set of positive and negative evaluation results from the issue and other issues/positive annotations of the same document,
   and runs it against the created evalaluation. 
*/
export async function recalculateAlignmentMetric(
  {
    workspace,
    commit,
    evaluationToEvaluate,
    issue,
  }: {
    workspace: Workspace
    commit: Commit
    evaluationToEvaluate: EvaluationV2<
      EvaluationType.Llm,
      LlmEvaluationMetric.Binary
    >
    issue: Issue
  },
  db = database,
) {
  const evaluationHash = generateConfigurationHash(evaluationToEvaluate)
  const hasEvaluationConfigurationChanged =
    evaluationHash !==
    evaluationToEvaluate.alignmentMetricMetadata?.alignmentHash

  // If config is unchanged, we don't need to recalculate the alignment metric, we can just append the new results from the new spans to the existing confusion matrix
  const positiveSpanCutoffDate = hasEvaluationConfigurationChanged
    ? undefined
    : evaluationToEvaluate.alignmentMetricMetadata
        ?.lastProcessedPositiveSpanDate
  const negativeSpanCutoffDate = hasEvaluationConfigurationChanged
    ? undefined
    : evaluationToEvaluate.alignmentMetricMetadata
        ?.lastProcessedNegativeSpanDate

  const examplesResult = await getEqualAmountsOfPositiveAndNegativeExamples(
    {
      workspace,
      commit,
      issue,
      positiveSpanCutoffDate,
      negativeSpanCutoffDate,
    },
    db,
  )
  if (!Result.isOk(examplesResult)) {
    return examplesResult
  }

  const {
    examplesThatShouldPassTheEvaluationSliced,
    examplesThatShouldFailTheEvaluationSliced,
  } = examplesResult.unwrap()

  const spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation =
    examplesThatShouldPassTheEvaluationSliced.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
      createdAt: new Date(span.createdAt).toISOString(),
    }))

  const spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation =
    examplesThatShouldFailTheEvaluationSliced.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
      createdAt: new Date(span.createdAt).toISOString(),
    }))

  const allSpans = [
    ...examplesThatShouldFailTheEvaluationSliced,
    ...examplesThatShouldPassTheEvaluationSliced,
  ]

  const flowProducer = new FlowProducer({
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
    }),
  })

  // Idempotency keys to avoid recalculating the alignment metric multiple times (if error occured or if trying more than once a day)
  const recalculateAligmentIdempotencyKey = `recalculateAlignmentMetricJob-evaluationUuid=${evaluationToEvaluate.uuid}-day=${new Date().toISOString().split('T')[0]}` // prettier-ignore
  const runEvaluationV2JobIdempotencyKey = (span: Span) =>
    `runEvaluationV2Job-evaluationUuid=${evaluationToEvaluate.uuid}-spanId=${span.id}-traceId=${span.traceId}-day=${new Date().toISOString().split('T')[0]}` // prettier-ignore

  const { job: validationFlowJob } = await flowProducer.add({
    name: `recalculateAlignmentMetricJob`,
    queueName: Queues.generateEvaluationsQueue,
    data: {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluationToEvaluate.uuid,
      documentUuid: issue.documentUuid,
      spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
      spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
      hasEvaluationConfigurationChanged,
    },
    opts: {
      jobId: recalculateAligmentIdempotencyKey,
      // FlowProducer does not inherit
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Need at least 2s for cases when runEval fails and we wait for the unprocessed children to finish
      },
    },
    children: allSpans.map((span) => ({
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
        jobId: runEvaluationV2JobIdempotencyKey(span),
        // Overriding eval queue options for faster retry policy to avoid user waiting too long for the evaluation to be generated
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 1000,
        },
        continueParentOnFailure: true,
      },
    })),
  })

  if (!validationFlowJob.id) {
    return Result.error(
      new Error('Failed to create evaluation validation flow'),
    )
  }

  return Result.ok(validationFlowJob)
}
