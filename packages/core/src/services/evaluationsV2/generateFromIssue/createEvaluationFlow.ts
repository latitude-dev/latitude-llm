import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { FlowProducer } from 'bullmq'
import { REDIS_KEY_PREFIX } from '@latitude-data/core/redis'
import { buildRedisConnection } from '@latitude-data/core/redis'
import { env } from '@latitude-data/env'
import { Queues } from '../../../jobs/queues/types'
import { Result } from '@latitude-data/core/lib/Result'
import { EvaluationV2 } from '@latitude-data/constants'
import { Issue } from '../../../schema/models/types/Issue'
import { getSpansByIssue } from '../../../data-access/issues/getSpansByIssue'
import { getSpansWithoutIssuesByDocumentUuid } from '../../../data-access/issues/getSpansWithoutIssuesByDocumentUuid'

const MAX_COMPARISON_ANNOTATIONS = 100

/*
  This function validates an existing evaluation by calculating its MCC (Matthews Correlation Coefficient),
    and updating the evaluation with the new quality metric

  To do this, it finds a set of positive and negative evaluation results from the issue and other issues/positive annotations of the same document,
   and runs it against the created evalaluation. 
*/
// TODO(evaluation-generation): Add new argument if its in the generation flow or if its just to get the current MCC (when we calculate it daily)
export async function createValidationFlow({
  workspace,
  commit,
  evaluationToEvaluate,
  issue,
}: {
  workspace: Workspace
  commit: Commit
  evaluationToEvaluate: EvaluationV2
  issue: Issue
}) {
  const spansResult =
    await getEqualAmountsOfPositiveAndNegativeEvaluationResults({
      workspace,
      commit,
      issue,
    })
  if (!Result.isOk(spansResult)) {
    return spansResult
  }
  const spans = spansResult.unwrap()

  const spanAndTraceIdPairsOfPositiveEvaluationRuns =
    spans.positiveEvaluationResults.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))
  const spanAndTraceIdPairsOfNegativeEvaluationRuns =
    spans.negativeEvaluationResults.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))
  const allSpans = [
    ...spans.positiveEvaluationResults,
    ...spans.negativeEvaluationResults,
  ]

  const flowProducer = new FlowProducer({
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
    }),
  })

  const { job: validationFlowJob } = await flowProducer.add({
    name: `calculateQualityMetricJob`,
    queueName: Queues.generateEvaluationsQueue,
    data: {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluationToEvaluate.uuid,
      documentUuid: issue.documentUuid,
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
        // overriding eval queue options for faster retry policy to avoid user waiting too long for the evaluation to be generated
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 1000,
        },
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

/*
Gets:
- the spans of the issue (positive evalResults)
- the spans of the other issues of the same document or the thumbs up evalResults of that document (negative evalResults)

Thumbs up evalResults of the same document or evalResults of other issues of the same document count as negative evalResults because
 they are cases in which the new evaluation should return a negative result, as that span doesnt have that issue
*/
async function getEqualAmountsOfPositiveAndNegativeEvaluationResults({
  workspace,
  commit,
  issue,
}: {
  workspace: Workspace
  commit: Commit
  issue: Issue
}) {
  const spansResult = await getSpansByIssue({
    workspace,
    commit,
    issue,
    pageSize: MAX_COMPARISON_ANNOTATIONS,
    page: 1,
  })
  if (!Result.isOk(spansResult)) {
    return spansResult
  }
  const { spans } = spansResult.unwrap()

  // Getting the same amount of negative evaluation results spans as the positive evaluation results spans
  const spansWithoutIssuesResult = await getSpansWithoutIssuesByDocumentUuid({
    workspace,
    commit,
    documentUuid: issue.documentUuid,
    pageSize: spans.length,
    page: 1,
  })
  if (!Result.isOk(spansWithoutIssuesResult)) {
    return spansWithoutIssuesResult
  }
  const { spans: spansWithoutIssues } = spansWithoutIssuesResult.unwrap()

  const targetLength = Math.min(spans.length, spansWithoutIssues.length)
  return Result.ok({
    positiveEvaluationResults: spans.slice(0, targetLength),
    negativeEvaluationResults: spansWithoutIssues.slice(0, targetLength),
  })
}

export const __test__ = {
  getEqualAmountsOfPositiveAndNegativeEvaluationResults,
}
