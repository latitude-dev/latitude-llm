'use server'

import { z } from 'zod'
import { withEvaluation } from '../procedures'
import { toggleLiveModeV2 } from '@latitude-data/core/services/evaluationsV2/toggleLiveMode'

export const toggleLiveModeAction = withEvaluation
  .createServerAction()
  .input(
    z.object({
      evaluationUuid: z.string(),
      live: z.boolean(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const result = await toggleLiveModeV2({
      evaluation: ctx.evaluation,
      commit: ctx.commit,
      live: input.live,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
