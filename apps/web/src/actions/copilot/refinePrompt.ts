'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import {
  DocumentVersionsRepository,
  EvaluationResultsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { serialize } from '@latitude-data/core/services/evaluationResults/serialize'
import { getEvaluationPrompt } from '@latitude-data/core/services/evaluations/index'
import { env } from '@latitude-data/env'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const refinePromptAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      projectId: z.number(),
      commitUuid: z.string(),
      documentUuid: z.string(),
      evaluationId: z.number(),
      evaluationResultIds: z.array(z.number()),
    }),
  )
  .handler(async ({ ctx, input }) => {
    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set')
    }
    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('COPILOT_PROJECT_ID is not set')
    }
    if (!env.COPILOT_REFINE_PROMPT_PATH) {
      throw new BadRequestError('COPILOT_REFINE_PROMPT_PATH is not set')
    }

    const {
      projectId,
      commitUuid,
      documentUuid,
      evaluationId,
      evaluationResultIds,
    } = input

    const documentsScope = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await documentsScope
      .getDocumentAtCommit({
        projectId,
        commitUuid,
        documentUuid,
      })
      .then((r) => r.unwrap())

    const evaluationsScope = new EvaluationsRepository(ctx.workspace.id)
    const evaluation = await evaluationsScope
      .find(evaluationId)
      .then((r) => r.unwrap())

    const evaluationResultsScope = new EvaluationResultsRepository(
      ctx.workspace.id,
    )

    const evaluationResults = await evaluationResultsScope
      .findMany(evaluationResultIds)
      .then((r) => r.unwrap())
    const serializedEvaluationResults = await Promise.all(
      evaluationResults.map((r) =>
        serialize({
          workspace: ctx.workspace,
          evaluationResult: r,
        }).then((r) => r.unwrap()),
      ),
    )

    const sdk = await createSdk({
      workspace: ctx.workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
    }).then((r) => r.unwrap())

    const evaluationPrompt = await getEvaluationPrompt({
      workspace: ctx.workspace,
      evaluation,
    }).then((r) => r.unwrap())

    const result = await sdk.prompts.run(env.COPILOT_REFINE_PROMPT_PATH, {
      stream: false,
      parameters: {
        prompt: document.content,
        evaluation: evaluationPrompt,
        results: serializedEvaluationResults,
      },
    })

    if (!result) throw new Error('Failed to refine prompt')

    publisher.publishLater({
      type: 'copilotRefinerGenerated',
      data: {
        userEmail: ctx.user.email,
        workspaceId: ctx.workspace.id,
        projectId,
        commitUuid,
        documentUuid: document.documentUuid,
        evaluationId: evaluation.id,
      },
    })

    return result.response.text
  })
