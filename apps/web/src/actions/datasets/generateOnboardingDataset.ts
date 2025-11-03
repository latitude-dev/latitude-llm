'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { generateDatasetWithCopilot } from '@latitude-data/core/services/datasets/generateWithCopilot'
import {
  SAMPLE_PROMPT,
  SAMPLE_PROMPT_DATASET,
} from '$/app/(onboarding)/onboarding-dataset/paste-your-prompt/constants'
import { createDatasetFromJson } from '@latitude-data/core/services/datasets/createFromJson'

export const generateOnboardingDatasetAction = authProcedure
  .inputSchema(
    z.object({
      parameters: z.string(),
      prompt: z.string().optional(),
      rowCount: z.number(),
      name: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { parameters, prompt, rowCount, name } = parsedInput

    if (prompt === SAMPLE_PROMPT) {
      // Caching the sample prompt dataset to avoid generating it every time
      return await createDatasetFromJson({
        author: ctx.user,
        workspace: ctx.workspace,
        data: {
          name,
          rows: JSON.stringify(SAMPLE_PROMPT_DATASET),
        },
      }).then((r) => r.unwrap())
    }

    return await generateDatasetWithCopilot({
      workspace: ctx.workspace,
      user: ctx.user,
      parameters,
      prompt,
      rowCount,
      name,
    }).then((r) => r.unwrap())
  })
