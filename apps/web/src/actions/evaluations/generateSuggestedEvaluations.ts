'use server'

import { createHash } from 'crypto'

import { ChainStepResponse } from '@latitude-data/core/browser'
import { cache } from '@latitude-data/core/cache'
import { findAllEvaluationTemplates } from '@latitude-data/core/data-access'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { env } from '@latitude-data/env'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { SuggestedEvaluation } from '$/stores/suggestedEvaluations'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const generateSuggestedEvaluationsAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      documentContent: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    if (!env.DATASET_GENERATOR_WORKSPACE_APIKEY) {
      throw new BadRequestError('DATASET_GENERATOR_WORKSPACE_APIKEY is not set')
    }
    if (!env.TEMPLATES_SUGGESTION_PROJECT_ID) {
      throw new BadRequestError('TEMPLATES_SUGGESTION_PROJECT_ID is not set')
    }
    if (!env.TEMPLATES_SUGGESTION_PROMPT_PATH) {
      throw new BadRequestError('TEMPLATES_SUGGESTION_PROMPT_PATH is not set')
    }

    const cacheInstance = await cache()
    const contentHash = createHash('sha1')
      .update(input.documentContent)
      .digest('hex')
    const cacheKey = `suggested_evaluations:${contentHash}`

    const cachedResult = await cacheInstance.get(cacheKey)
    if (cachedResult) {
      return JSON.parse(cachedResult) as SuggestedEvaluation[]
    }

    const templates = await findAllEvaluationTemplates().then((r) => r.unwrap())
    const templateString = templates
      .map((t) => `${t.id}\n${t.name}\n${t.description}\n`)
      .join('\n')
    const sdk = await createSdk({
      apiKey: env.DATASET_GENERATOR_WORKSPACE_APIKEY,
      projectId: env.TEMPLATES_SUGGESTION_PROJECT_ID,
    }).then((r) => r.unwrap())
    const result = await sdk.run(env.TEMPLATES_SUGGESTION_PROMPT_PATH, {
      parameters: {
        templates: templateString,
        prompt: input.documentContent,
      },
    })

    if (!result) return []

    const res = result.response as ChainStepResponse<'object'>
    if (!res.object) return []

    const suggestedEvaluations = res.object[0] as SuggestedEvaluation[]

    await cacheInstance.set(cacheKey, JSON.stringify(suggestedEvaluations))

    return suggestedEvaluations
  })
