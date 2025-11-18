import { withDocument, withDocumentSchema } from '../procedures'
import { ErrorResult, Result } from '@latitude-data/core/lib/Result'
import { LatitudeError } from '@latitude-data/core/lib/errors'
import { z } from 'zod'
import { queues } from '@latitude-data/core/queues'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'
import { assertCopilotIsSupported } from '@latitude-data/core/services/copilot/assertItsSupported'
import { env } from '@latitude-data/env'

export const generateEvaluationV2FromIssueAction = withDocument
  .inputSchema(withDocumentSchema.extend({ issueId: z.number() }))
  .action(async ({ ctx, parsedInput }) => {
    const { workspace, commit } = ctx
    const { issueId } = parsedInput

    const supportResult = assertCopilotIsSupported(
      CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot,
    )

    if (!env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH) {
      return Result.error(
        new Error('COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set'),
      )
    }

    if (!Result.isOk(supportResult))
      return supportResult as ErrorResult<LatitudeError>

    const { evaluationsQueue } = await queues()
    const job = await evaluationsQueue.add('generateEvaluationV2FromIssueJob', {
      workspaceId: workspace.id,
      commitId: commit.id,
      issueId: issueId,
    })

    if (!job.id)
      return Result.error(
        new LatitudeError(
          'Generate evaluation from issue failed due to missing job id',
        ),
      )
  })
