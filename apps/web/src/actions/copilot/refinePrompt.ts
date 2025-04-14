'use server'

import { createSdk } from '$/app/(private)/_lib/createSdk'
import { CLOUD_MESSAGES } from '@latitude-data/core/browser'
import { publisher } from '@latitude-data/core/events/publisher'
import {
  BadRequestError,
  UnprocessableEntityError,
} from '@latitude-data/core/lib/errors'
import {
  EvaluationResultsRepository,
  EvaluationResultsV2Repository,
  EvaluationsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import {
  serializeEvaluationResult as serializeEvaluationResultV2,
  serializeEvaluation as serializeEvaluationV2,
} from '@latitude-data/core/services/documentSuggestions/serialize'
import { serialize as serializeEvaluationResult } from '@latitude-data/core/services/evaluationResults/serialize'
import { getEvaluationPrompt as serializeEvaluation } from '@latitude-data/core/services/evaluations/prompt/index'
import { env } from '@latitude-data/env'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const refinePromptAction = withDocument
  .createServerAction()
  .input(
    z.object({
      evaluationId: z.number().optional(),
      evaluationUuid: z.string().optional(),
      resultIds: z.array(z.number()).optional(),
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

    if (!env.COPILOT_REFINE_PROMPT_PATH) {
      throw new BadRequestError('COPILOT_REFINE_PROMPT_PATH is not set')
    }

    const { evaluationId, evaluationUuid, resultIds, resultUuids } = input

    // @ts-expect-error: Seems TypeScript cannot infer the type...
    let evaluation
    let serializedEvaluation
    let results
    let serializedResults

    if (evaluationId) {
      const evaluationsRepository = new EvaluationsRepository(ctx.workspace.id)
      evaluation = await evaluationsRepository
        .find(evaluationId)
        .then((r) => r.unwrap())
        .then((e) => ({ ...e, version: 'v1' as const }))

      serializedEvaluation = await serializeEvaluation({
        workspace: ctx.workspace,
        evaluation: evaluation,
      }).then((r) => r.unwrap())

      const resultsRepository = new EvaluationResultsRepository(
        ctx.workspace.id,
      )
      results = await resultsRepository
        .findMany([...new Set(resultIds)])
        .then((r) => r.unwrap())
        .then((r) => r.map((r) => ({ ...r, version: 'v1' as const })))

      serializedResults = await Promise.all(
        results.map((result) =>
          serializeEvaluationResult({
            workspace: ctx.workspace,
            evaluationResult: result,
          }).then((r) => r.unwrap()),
        ),
      )
    } else {
      const evaluationsRepository = new EvaluationsV2Repository(
        ctx.workspace.id,
      )
      evaluation = await evaluationsRepository
        .getAtCommitByDocument({
          projectId: ctx.project.id,
          commitUuid: ctx.commit.uuid,
          documentUuid: ctx.document.documentUuid,
          evaluationUuid: evaluationUuid!,
        })
        .then((r) => r.unwrap())
        .then((e) => ({ ...e, version: 'v2' as const }))

      serializedEvaluation = await serializeEvaluationV2({ evaluation }).then(
        (r) => r.unwrap(),
      )

      const resultsRepository = new EvaluationResultsV2Repository(
        ctx.workspace.id,
      )
      results = await resultsRepository
        .findManyByUuid([...new Set(resultUuids)])
        .then((r) => r.unwrap())
        .then((r) => r.map((r) => ({ ...r, version: 'v2' as const })))

      serializedResults = await Promise.all(
        results.map((result) =>
          serializeEvaluationResultV2({
            // @ts-expect-error: Seems TypeScript cannot infer the type...
            evaluation: evaluation,
            result: result,
            workspace: ctx.workspace,
          }).then((r) => r.unwrap()),
        ),
      )
    }

    const sdk = await createSdk({
      workspace: ctx.workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
    }).then((r) => r.unwrap())

    const result = await sdk.prompts.run(env.COPILOT_REFINE_PROMPT_PATH, {
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
        ...(evaluation.version === 'v2'
          ? { evaluationUuid: evaluation.uuid, version: 'v2' }
          : { evaluationId: evaluation.id, version: 'v1' }),
      },
    })

    return result.response.object as {
      prompt: string
      summary: string
    }
  })
