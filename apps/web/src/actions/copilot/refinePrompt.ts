'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import {
  BadRequestError,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'
import {
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import {
  serializeEvaluationResult as serializeEvaluationResultV2,
  serializeEvaluation as serializeEvaluationV2,
} from '@latitude-data/core/services/copilot/serializeEvaluation'
import { env } from '@latitude-data/env'
import { z } from 'zod'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'
import { withDocument, withDocumentSchema } from '../procedures'
import { runCopilot } from '@latitude-data/core/services/copilot/run'

export const refinePromptAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      evaluationUuid: z.string().optional(),
      resultUuids: z.array(z.string()).optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    if (!env.LATITUDE_CLOUD) {
      throw new BadRequestError(CLOUD_MESSAGES.refinePrompt)
    }

    if (!env.COPILOT_PROMPT_REFINE_PATH) {
      throw new BadRequestError('COPILOT_PROMPT_REFINE_PATH is not set')
    }

    const { evaluationUuid, resultUuids } = parsedInput

    let evaluation
    let serializedEvaluation
    let results
    let serializedResults

    const evaluationsRepository = new EvaluationsV2Repository(ctx.workspace.id)
    evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        projectId: ctx.project.id,
        commitUuid: ctx.commit.uuid,
        documentUuid: ctx.document.documentUuid,
        evaluationUuid: evaluationUuid!,
      })
      .then((r) => r.unwrap())

    serializedEvaluation = await serializeEvaluationV2({ evaluation }).then(
      (r) => r.unwrap(),
    )

    const resultsRepository = new EvaluationResultsV2Repository(
      ctx.workspace.id,
    )
    results = await resultsRepository
      .findManyByUuid([...new Set(resultUuids)])
      .then((r) => r.unwrap())

    serializedResults = await Promise.all(
      results.map((result) =>
        serializeEvaluationResultV2({
          evaluation,
          result: result,
          workspace: ctx.workspace,
        }).then((r) => r.unwrap()),
      ),
    )

    const result = await runCopilot({
      path: env.COPILOT_PROMPT_REFINE_PATH,
      parameters: {
        prompt: ctx.document.content,
        evaluation: serializedEvaluation,
        results: serializedResults,
      },
      schema: z.object({
        prompt: z.string(),
        summary: z.string(),
      }),
    })
    if (result.error) {
      throw new UnprocessableEntityError(result.error.message)
    }

    publisher.publishLater({
      type: 'copilotRefinerGenerated',
      data: {
        workspaceId: ctx.workspace.id,
        projectId: ctx.project.id,
        commitUuid: ctx.commit.uuid,
        documentUuid: ctx.document.documentUuid,
        userEmail: ctx.user.email,
        evaluationUuid: evaluation.uuid,
      },
    })

    return result.value
  })
