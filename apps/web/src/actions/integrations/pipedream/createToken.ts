'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { createConnectToken } from '@latitude-data/core/services/integrations/pipedream/createConnectToken'

export const createPipedreamTokenAction = authProcedure
  .inputSchema(
    z.object({
      externalUserId: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { externalUserId } = parsedInput

    return createConnectToken({
      workspace: ctx.workspace,
      externalUserId,
    }).then((r) => r.unwrap())
  })
