'use server'

import { createSdk } from '$/app/(private)/_lib/createSdk'
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
} from '@latitude-data/core/services/documentSuggestions/serialize'
import { env } from '@latitude-data/env'
import { z } from 'zod'
import { withDocument } from '../procedures'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'

export const refinePromptAction = withDocument
  .createServerAction()
  .input(
    z.object({
      evaluationUuid: z.string().optional(),
      resultUuids: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    if (!env.LATITUDE_CLOUD) {
      throw new BadRequestError(CLOUD_MESSAGES.refinePrompt)
    }

    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set')
    }

    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('COPILOT_PROJECT_ID is not set')
    }

    if (!env.COPILOT_PROMPT_REFINE_PATH) {
      throw new BadRequestError('COPILOT_PROMPT_REFINE_PATH is not set')
    }

    const { evaluationUuid, resultUuids } = input

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

    const sdk = await createSdk({
      workspace: ctx.workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
    }).then((r) => r.unwrap())

    const result = await sdk.prompts.run<{
      prompt: string
      summary: string
    }>(env.COPILOT_PROMPT_REFINE_PATH, {
      stream: false,
      parameters: {
        prompt: ctx.document.content,
        evaluation: serializedEvaluation,
        results: serializedResults,
      },
    })
    if (!result || result.response.streamType !== 'object') {
      throw new UnprocessableEntityError('Failed to refine prompt')
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

    return result.response.object as {
      prompt: string
      summary: string
    }
  })
