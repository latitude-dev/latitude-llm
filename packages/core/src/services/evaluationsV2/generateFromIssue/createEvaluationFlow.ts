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
import { getHITLSpansByIssue } from '../../../data-access/issues/getHITLSpansByIssue'
import { getHITLSpansByDocument } from '../../../data-access/issues/getHITLSpansByDocument'
import { database } from '../../../client'

const MAX_COMPARISON_ANNOTATIONS = 100

/*
  This function validates an existing evaluation by calculating its MCC (Matthews Correlation Coefficient),
    and updating the evaluation with the new quality metric

  To do this, it finds a set of positive and negative evaluation results from the issue and other issues/positive annotations of the same document,
   and runs it against the created evalaluation. 
*/
// TODO(evaluation-generation): Add new argument if its in the generation flow or if its just to get the current MCC (when we calculate it daily)
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
    examplesThatShouldFailTheEvaluation,
    examplesThatShouldPassTheEvaluation,
  } = examplesResult.unwrap()

  const spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation =
    examplesThatShouldPassTheEvaluation.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))
  const spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation =
    examplesThatShouldFailTheEvaluation.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))

  const allSpans = [
    ...examplesThatShouldFailTheEvaluation,
    ...examplesThatShouldPassTheEvaluation,
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
      // Idempotency key
      jobId: `calculateQualityMetricJob-wf=${workflowUuid}-generationAttempt=${generationAttempt}`,
      // FlowProducer does not inherit
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
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
        jobId: `runEvaluationV2Job-wf=${workflowUuid}-generationAttempt=${generationAttempt}-spanId=${span.id}-traceId=${span.traceId}`,
        // Overriding eval queue options for faster retry policy to avoid user waiting too long for the evaluation to be generated
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 1000,
        },
        continueParentOnFailure: true, // If an evaluation run fails, continue the flow to calculate the quality metric
      },
    })),
  })

  if (!validationFlowJob.id) {
    return Result.error(
      new Error('Failed to create evaluation validation flow'),
    )
  }

  console.log('validationFlowJob', validationFlowJob.id)
  return Result.ok(validationFlowJob)
}
/*
Gets:
- the spans of the issue that were annotated by the user (HITL evaluation results) (examples that should fail the evaluation)
- the spans of the other issues of the same document or the thumbs up evalResults of that document that were annotated by the user (HITL evaluation results) (examples that should pass the evaluation)

IMPORTANT: 
- The evaluation MUST fail when the issue is present in the span, as this logic is used within the issue discovery and its how we want our end goal to be.
  We want the evaluations to be like unit tests, where if all of them pass for a given trace of a document, that means that the trace has no issues, that its good!
- The spans MUST be from HITL evaluation results, as we want to use the user's annotations to calculate the MCC, not from other evaluations results

Thumbs up evalResults of the same document or evalResults of other issues of the same document count as negative evalResults because
 they are cases in which the new evaluation should return a negative result, as that span doesnt have that issue
*/
async function getEqualAmountsOfPositiveAndNegativeExamples(
  {
    workspace,
    commit,
    issue,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
  },
  db = database,
) {
  const examplesThatShouldFailTheEvaluationResult = await getHITLSpansByIssue(
    {
      workspace,
      commit,
      issue,
      pageSize: MAX_COMPARISON_ANNOTATIONS,
      page: 1,
    },
    db,
  )
  if (!Result.isOk(examplesThatShouldFailTheEvaluationResult)) {
    return examplesThatShouldFailTheEvaluationResult
  }
  const { spans: examplesThatShouldFailTheEvaluation } =
    examplesThatShouldFailTheEvaluationResult.unwrap()

  // Getting the same amount of examples that should pass the evaluation, as we need an equal amount of both to calculate correctly the MCC
  const examplesThatShouldPassTheEvaluationResult =
    await getHITLSpansByDocument(
      {
        workspace,
        commit,
        documentUuid: issue.documentUuid,
        pageSize: examplesThatShouldFailTheEvaluation.length,
        excludeIssueId: issue.id,
        page: 1,
      },
      db,
    )
  if (!Result.isOk(examplesThatShouldPassTheEvaluationResult)) {
    return examplesThatShouldPassTheEvaluationResult
  }
  const { spans: examplesThatShouldPassTheEvaluation } =
    examplesThatShouldPassTheEvaluationResult.unwrap()

  const targetLength = Math.min(
    examplesThatShouldFailTheEvaluation.length,
    examplesThatShouldPassTheEvaluation.length,
  )
  return Result.ok({
    examplesThatShouldPassTheEvaluation: examplesThatShouldPassTheEvaluation.slice(0, targetLength), // prettier-ignore
    examplesThatShouldFailTheEvaluation: examplesThatShouldFailTheEvaluation.slice(0, targetLength), // prettier-ignore
  })
}

export const __test__ = {
  getEqualAmountsOfPositiveAndNegativeExamples,
}
