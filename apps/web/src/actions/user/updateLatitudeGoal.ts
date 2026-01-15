'use server'

import { updateUser } from '@latitude-data/core/services/users/update'
import { LatitudeGoal } from '@latitude-data/constants/users'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const updateLatitudeGoalAction = authProcedure
  .inputSchema(
    z.object({
      latitudeGoal: z.nativeEnum(LatitudeGoal),
      latitudeGoalOther: z.string().optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await updateUser(ctx.user, {
      latitudeGoal: parsedInput.latitudeGoal,
      latitudeGoalOther: parsedInput.latitudeGoalOther ?? null,
    }).then((r) => r.unwrap())

    return result
  })
