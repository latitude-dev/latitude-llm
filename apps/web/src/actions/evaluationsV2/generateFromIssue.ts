'use server'

import { withDocument, withDocumentSchema } from '../procedures'
import { LatitudeError } from '@latitude-data/core/lib/errors'
import { z } from 'zod'
import { queues } from '@latitude-data/core/queues'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'
import { assertCopilotIsSupported } from '@latitude-data/core/services/copilot/assertItsSupported'
import { env } from '@latitude-data/env'

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

    assertCopilotIsSupported(
      CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot,
    ).unwrap()

    if (!env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH) {
      throw new Error(
        'COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set',
      )
    }
    console.log('providerName', providerName)
    console.log('model', model)

    const { evaluationsQueue } = await queues()
    const job = await evaluationsQueue.add('generateEvaluationV2FromIssueJob', {
      workspaceId: workspace.id,
      commitId: commit.id,
      issueId: issueId,
      providerName: providerName,
      model: model,
    })

    if (!job.id)
      throw new LatitudeError(
        'Generate evaluation from issue failed due to missing job id',
      )

    return job.id
  })
