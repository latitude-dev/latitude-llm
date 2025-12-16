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
} from '@latitude-data/constants'
import { Issue } from '../../../schema/models/types/Issue'
import { database } from '../../../client'
import { getEqualAmountsOfPositiveAndNegativeExamples } from './getEqualAmountsOfPositiveAndNegativeExamples'
import { generateConfigurationHash } from '../generateConfigurationHash'
import { Span } from '@latitude-data/constants/tracing'

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
  const examplesResult = await getEqualAmountsOfPositiveAndNegativeExamples(
    {
      workspace,
      commit,
      issue,
    },
    db,
  )
  if (!Result.isOk(examplesResult)) {
    return examplesResult
  }
  const { examplesThatShouldPassTheEvaluationSliced, examplesThatShouldFailTheEvaluationSliced } = examplesResult.unwrap() // prettier-ignore

  let spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation =
    examplesThatShouldPassTheEvaluationSliced.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))
  let spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation =
    examplesThatShouldFailTheEvaluationSliced.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))

  let allSpans = [...examplesThatShouldFailTheEvaluationSliced, ...examplesThatShouldPassTheEvaluationSliced] // prettier-ignore

  const evaluationHash = generateConfigurationHash(evaluationToEvaluate)
  const hasEvaluationConfigurationChanged = evaluationHash !== evaluationToEvaluate.alignmentMetricMetadata?.alignmentHash // prettier-ignore

  // If the evaluation configuration hasn't changed, we don't have to recalculate the entire aligment metric, we can aggregate the new span results to the existing confusion matrix and avoid extra evalRuns
  if (!hasEvaluationConfigurationChanged) {
    // Only process spans from yesterday (since job runs at 1AM daily)
    const cutoff = getYesterdayCutoff()
    const isFromYesterday = (span: Span) => new Date(span.createdAt) >= cutoff

    const passSpansFromYesterday =
      examplesThatShouldPassTheEvaluationSliced.filter(isFromYesterday)
    const failSpansFromYesterday =
      examplesThatShouldFailTheEvaluationSliced.filter(isFromYesterday)

    // Re-balance to have equal amounts
    const targetLength = Math.min(passSpansFromYesterday.length, failSpansFromYesterday.length) // prettier-ignore

    const passSpansFromYesterdaySliced = passSpansFromYesterday.slice(0, targetLength) // prettier-ignore
    const failSpansFromYesterdaySliced = failSpansFromYesterday.slice(0, targetLength) // prettier-ignore

    allSpans = [...failSpansFromYesterdaySliced, ...passSpansFromYesterdaySliced] // prettier-ignore

    spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation =
      passSpansFromYesterdaySliced.map((span) => ({
        spanId: span.id,
        traceId: span.traceId,
      }))

    spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation =
      failSpansFromYesterdaySliced.map((span) => ({
        spanId: span.id,
        traceId: span.traceId,
      }))
  }

  const flowProducer = new FlowProducer({
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
    }),
  })

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
      // Idempotency key
      jobId: `recalculateAlignmentMetricJob-evaluationUuid=${evaluationToEvaluate.uuid}`,
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
        // Idempotency key
        jobId: `runEvaluationV2Job-evaluationUuid=${evaluationToEvaluate.uuid}-spanId=${span.id}-traceId=${span.traceId}`,
        // Overriding eval queue options for faster retry policy to avoid user waiting too long for the evaluation to be generated
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 1000,
        },
        continueParentOnFailure: true, // If an evaluation run fails, continue the flow to calculate the alignment metric
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

const getYesterdayCutoff = () => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 1)
  cutoff.setHours(0, 0, 0, 0) // Start of yesterday
  return cutoff
}
