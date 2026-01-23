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
import { database } from '../../../client'
import { getEqualAmountsOfPositiveAndNegativeExamples } from './getEqualAmountsOfPositiveAndNegativeExamples'

/*
  This function validates an existing evaluation by calculating its MCC (Matthews Correlation Coefficient),
    and updating the evaluation with the new alignment metric

  To do this, it finds a set of positive and negative evaluation results from the issue and other issues/positive annotations of the same document,
   and runs it against the created evalaluation. 
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

  const flowProducer = new FlowProducer({
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
    }),
  })

  const { job: validationFlowJob } = await flowProducer.add({
    name: `validateGeneratedEvaluationJob`,
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
      jobId: `validateGeneratedEvaluationJob-wf=${workflowUuid}-generationAttempt=${generationAttempt}`,
      // FlowProducer does not inherit
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Need at least 2s for cases when runEval fails and we wait for the unprocessed children to finish
      },
    },
    children: allSpans.map((span, index) => ({
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
        jobId: `runEvaluationV2Job-wf=${workflowUuid}-gen=${generationAttempt}-idx=${index}`,
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
