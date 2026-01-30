import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Result } from '@latitude-data/core/lib/Result'
import { database } from '../../../client'
import {
  createSequentialFlow,
  enqueueFlow,
  FlowStep,
} from '../../../jobs/flows'
import { Queues } from '../../../jobs/queues/types'
import { Issue } from '../../../schema/models/types/Issue'
import { generateConfigurationHash } from '../generateConfigurationHash'
import { getEqualAmountsOfPositiveAndNegativeExamples } from './getEqualAmountsOfPositiveAndNegativeExamples'

export type RecalculationSource = 'daily' | 'configChange'

/**
 * Creates a BullMQ flow to recalculate the alignment metric of an evaluation.
 *
 * To do this, it finds a set of positive and negative evaluation results from the issue
 * and other issues/positive annotations of the same document, and runs it against the created evaluation.
 *
 * @param source - 'daily' uses day-based idempotency (prevents duplicate daily runs),
 *                 'configChange' uses timestamp-based idempotency (allows immediate re-runs)
 */
export async function recalculateAlignmentMetric(
  {
    workspace,
    commit,
    evaluationToEvaluate,
    issue,
    source,
  }: {
    workspace: Workspace
    commit: Commit
    evaluationToEvaluate: EvaluationV2<
      EvaluationType.Llm,
      LlmEvaluationMetric.Binary
    >
    issue: Issue
    source: RecalculationSource
  },
  db = database,
) {
  const evaluationHash = generateConfigurationHash(evaluationToEvaluate)
  const hasEvaluationConfigurationChanged =
    evaluationHash !==
    evaluationToEvaluate.alignmentMetricMetadata?.alignmentHash

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
      id: span.id,
      traceId: span.traceId,
      createdAt: new Date(span.createdAt).toISOString(),
    }))

  const spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation =
    examplesThatShouldFailTheEvaluationSliced.map((span) => ({
      id: span.id,
      traceId: span.traceId,
      createdAt: new Date(span.createdAt).toISOString(),
    }))

  const allSpans = [
    ...examplesThatShouldFailTheEvaluationSliced,
    ...examplesThatShouldPassTheEvaluationSliced,
  ]

  const idempotencySuffix =
    source === 'daily'
      ? `day=${new Date().toISOString().split('T')[0]}`
      : `ts=${Date.now()}`

  const flowId = `recalculateAlignmentMetricJob-eval=${evaluationToEvaluate.uuid}-${idempotencySuffix}`

  const parallelEvaluationSteps: FlowStep[] = allSpans.map((span, index) => ({
    name: 'runEvaluationV2Job',
    queue: Queues.evaluationsQueue,
    data: {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluationToEvaluate.uuid,
      spanId: span.id,
      traceId: span.traceId,
      dry: true,
    },
    opts: {
      jobId: `runEvaluationV2Job-eval=${evaluationToEvaluate.uuid}-${idempotencySuffix}-idx=${index}`,
      attempts: 2,
      backoff: {
        type: 'fixed' as const,
        delay: 1000,
      },
      continueParentOnFailure: true,
    },
  }))

  const flow = createSequentialFlow({
    flowId,
    steps: [
      parallelEvaluationSteps,
      {
        name: 'recalculateAlignmentMetricJob',
        queue: Queues.generateEvaluationsQueue,
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
          jobId: flowId,
          attempts: 3,
          backoff: {
            type: 'exponential' as const,
            delay: 2000,
          },
        },
      },
    ],
  })

  const result = await enqueueFlow(flow)
  if (!Result.isOk(result)) {
    return result
  }

  return Result.ok({ id: result.value.rootJobId })
}
