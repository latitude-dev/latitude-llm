'use server'

import {
  ActionBackendParameters,
  ActionFrontendParameters,
  ActionType,
} from '@latitude-data/core/browser'
import { executeAction } from '@latitude-data/core/services/actions/execute'
import { z } from 'zod'
import { authProcedure, withRateLimit } from '../procedures'

export const executeBackendAction = authProcedure
  .use(withRateLimit({ limit: 10, period: 60 }))
  .inputSchema(
    z.object({
      type: z.enum(ActionType),
      parameters: z.custom<ActionBackendParameters>(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await executeAction({
      type: parsedInput.type,
      parameters: parsedInput.parameters,
      user: ctx.user,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result as ActionFrontendParameters
  })
