'use server'

import { ChainStepResponse } from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import {
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
} from '@latitude-data/core/repositories'
import { env } from '@latitude-data/env'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const requestSuggestionAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      projectId: z.number(),
      commitUuid: z.string(),
      documentUuid: z.string(),
      request: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    if (!env.DATASET_GENERATOR_WORKSPACE_APIKEY) {
      throw new BadRequestError('DATASET_GENERATOR_WORKSPACE_APIKEY is not set')
    }
    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('COPILOT_PROJECT_ID is not set')
    }
    if (!env.COPILOT_CODE_SUGGESTION_PROMPT_PATH) {
      throw new BadRequestError(
        'COPILOT_CODE_SUGGESTION_PROMPT_PATH is not set',
      )
    }

    const { projectId, commitUuid, documentUuid, request } = input

    const documentsScope = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await documentsScope
      .getDocumentAtCommit({
        projectId,
        commitUuid,
        documentUuid,
      })
      .then((r) => r.unwrap())

    const providersScope = new ProviderApiKeysRepository(ctx.workspace.id)
    const providers = await providersScope
      .findAll()
      .then((r) =>
        r.unwrap().map((p) => ({ name: p.name, provider: p.provider })),
      )

    const sdk = await createSdk({
      apiKey: env.DATASET_GENERATOR_WORKSPACE_APIKEY,
      projectId: env.COPILOT_PROJECT_ID,
    }).then((r) => r.unwrap())

    const result = await sdk.run(env.COPILOT_CODE_SUGGESTION_PROMPT_PATH, {
      parameters: {
        prompt: document.content,
        request,
        providers,
      },
    })

    if (!result) throw new Error('Failed to request prompt suggestion')

    const resultResponse = result.response as ChainStepResponse<'object'>
    return resultResponse.object
  })
