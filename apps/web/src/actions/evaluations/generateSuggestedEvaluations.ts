'use server'

import { createHash } from 'crypto'

import { createSdk } from '$/app/(private)/_lib/createSdk'
import { SuggestedEvaluation } from '$/stores/suggestedEvaluations'
import { ChainStepResponse, CLOUD_MESSAGES } from '@latitude-data/core/browser'
import { cache } from '@latitude-data/core/cache'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { env } from '@latitude-data/env'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const generateSuggestedEvaluationsAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      documentContent: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    if (!env.LATITUDE_CLOUD) {
      throw new BadRequestError(CLOUD_MESSAGES.autogenerateEvaluations)
    }

    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set')
    }

    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('COPILOT_PROJECT_ID is not set')
    }

    if (!env.COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH) {
      throw new BadRequestError(
        'COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH is not set',
      )
    }

    const cacheInstance = await cache()
    const contentHash = createHash('sha1')
      .update(input.documentContent)
      .digest('hex')
    const cacheKey = `suggested_evaluations:v2:${contentHash}`
    let cachedResult: string | undefined | null
    try {
      cachedResult = await cacheInstance.get(cacheKey)
    } catch (e) {
      // do nothing
    }

    if (cachedResult) {
      return JSON.parse(cachedResult) as SuggestedEvaluation
    }

    const sdk = await createSdk({
      workspace: ctx.workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
    }).then((r) => r.unwrap())
    const result = await sdk.prompts.run(
      env.COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH,
      {
        stream: false,
        parameters: {
          user_prompt: input.documentContent,
        },
      },
    )
    if (!result) return undefined

    const res = result.response as ChainStepResponse<'object'>
    if (!res.object) return undefined

    const suggestedEvaluation = res.object

    try {
      await cacheInstance.set(cacheKey, JSON.stringify(suggestedEvaluation))
    } catch (e) {
      // do nothing
    }

    return suggestedEvaluation
  })
