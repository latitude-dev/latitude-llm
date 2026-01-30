import { EvaluationV2 } from '@latitude-data/constants'
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
import { getEqualAmountsOfPositiveAndNegativeExamples } from './getEqualAmountsOfPositiveAndNegativeExamples'

/**
 * Creates a validation flow for an existing evaluation by calculating its MCC
 * (Matthews Correlation Coefficient) and updating the evaluation with the new
 * alignment metric.
 *
 * The flow finds a set of positive and negative evaluation results from the issue
 * and other issues/positive annotations of the same document, and runs it against
 * the created evaluation.
 */
export async function createValidationFlow(
  {
    workspace,
    commit,
    workflowUuid,
    evaluationToEvaluate,
    issue,
    generationAttempt,
    providerName,
    model,
  }: {
    workspace: Workspace
    commit: Commit
    workflowUuid: string
    evaluationToEvaluate: EvaluationV2
    issue: Issue
    generationAttempt: number
    providerName: string
    model: string
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

  const flowId = `validateGeneratedEvaluationJob-wf=${workflowUuid}-generationAttempt=${generationAttempt}`

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
      jobId: `runEvaluationV2Job-wf=${workflowUuid}-gen=${generationAttempt}-idx=${index}`,
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
        name: 'validateGeneratedEvaluationJob',
        queue: Queues.generateEvaluationsQueue,
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          workflowUuid,
          generationAttempt,
          providerName,
          model,
          issueId: issue.id,
          evaluationUuid: evaluationToEvaluate.uuid,
          documentUuid: issue.documentUuid,
          spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
          spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
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
