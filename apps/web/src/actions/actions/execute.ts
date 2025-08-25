'use server'

import {
  type ActionBackendParameters,
  type ActionFrontendParameters,
  ActionType,
} from '@latitude-data/core/browser'
import { executeAction } from '@latitude-data/core/services/actions/execute'
import { z } from 'zod'
import { authProcedure, withRateLimit } from '../procedures'

export const executeBackendAction = (
  await withRateLimit(authProcedure, {
    limit: 10,
    period: 60,
  })
)
  .createServerAction()
  .input(
    z.object({
      type: z.nativeEnum(ActionType),
      parameters: z.custom<ActionBackendParameters>(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const result = await executeAction({
      type: input.type,
      parameters: input.parameters,
      user: ctx.user,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result as ActionFrontendParameters
  })
