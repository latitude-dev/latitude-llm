'use server'

import { updateUser } from '@latitude-data/core/services/users/update'
import { AIUsageStage } from '@latitude-data/constants/users'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const updateAIUsageStageAction = authProcedure
  .inputSchema(
    z.object({
      aiUsageStage: z.nativeEnum(AIUsageStage),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await updateUser(ctx.user, {
      aiUsageStage: parsedInput.aiUsageStage,
    }).then((r) => r.unwrap())

    return result
  })
