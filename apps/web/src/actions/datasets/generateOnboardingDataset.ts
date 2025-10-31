'use server'

import { z } from 'zod'
import { BadRequestError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { authProcedure } from '$/actions/procedures'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'
import { generateDatasetWithCopilot } from '@latitude-data/core/services/datasets/generateWithCopilot'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
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
      fromCloud: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { parameters, prompt, rowCount, name, fromCloud } = parsedInput

    if (fromCloud && !env.LATITUDE_CLOUD) {
      throw new BadRequestError(CLOUD_MESSAGES.generateDatasets)
    } else if (!fromCloud && !env.LATITUDE_CLOUD) {
      // If user is self-hosted and they're in the new dataset onboarding, we complete the onboarding and redirect to the dashboard as they cannot generate the dataset with copilot
      const onboarding = await getWorkspaceOnboarding({
        workspace: ctx.workspace,
      }).then((r) => r.unwrap())

      await markWorkspaceOnboardingComplete({
        onboarding,
      }).then((r) => r.unwrap())
      return redirect(ROUTES.dashboard.root)
    }

    if (prompt === SAMPLE_PROMPT) {
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
