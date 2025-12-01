'use server'

import { withDocument, withDocumentSchema } from '../procedures'
import { LatitudeError } from '@latitude-data/core/lib/errors'
import { z } from 'zod'
import { queues } from '@latitude-data/core/queues'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'
import { assertCopilotIsSupported } from '@latitude-data/core/services/copilot/assertItsSupported'
import { env } from '@latitude-data/env'
import { cache } from '@latitude-data/core/cache'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { createActiveEvaluation } from '@latitude-data/core/services/evaluationsV2/active/create'
import { deleteActiveEvaluation } from '@latitude-data/core/services/evaluationsV2/active/delete'
import { publisher } from '@latitude-data/core/events/publisher'

export const generateEvaluationV2FromIssueAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      issueId: z.number(),
      providerName: z.string(),
      model: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace, commit } = ctx
    const { issueId, providerName, model } = parsedInput
    const redisCache = await cache()

    assertCopilotIsSupported(
      CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot,
    ).unwrap()

    if (!env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH) {
      throw new Error(
        'COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set',
      )
    }

    const activeEvaluation = await createActiveEvaluation({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      workflowUuid: generateUUIDIdentifier(),
      issueId: issueId,
      queuedAt: new Date(),
      cache: redisCache,
    }).then((r) => r.unwrap())

    const { generateEvaluationsQueue } = await queues()
    const job = await generateEvaluationsQueue.add(
      'generateEvaluationV2FromIssueJob',
      {
        workspaceId: workspace.id,
        commitId: commit.id,
        issueId: issueId,
        providerName: providerName,
        model: model,
        workflowUuid: activeEvaluation.workflowUuid,
        generationAttempt: 1, // first attempt
      },
      {
        // Idempotency key
        jobId: `generateEvaluationV2FromIssueJob:wf=${activeEvaluation.workflowUuid}:generationAttempt=1`,
      },
    )

    if (!job.id) {
      await deleteActiveEvaluation({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        workflowUuid: activeEvaluation.workflowUuid,
        cache: redisCache,
      }).then((r) => r.unwrap())
      throw new LatitudeError(
        'Generate evaluation from issue failed due to missing job id',
      )
    }

    await publisher.publishLater({
      type: 'evaluationQueued',
      data: {
        workspaceId: workspace.id,
        projectId: commit.projectId,
        evaluation: activeEvaluation,
      },
    })

    return activeEvaluation
  })
