'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { createConnectToken } from '@latitude-data/core/services/integrations/pipedream/createConnectToken'

export const createPipedreamTokenAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      externalUserId: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { externalUserId } = input

    return createConnectToken({
      workspace: ctx.workspace,
      externalUserId,
    }).then((r) => r.unwrap())
  })
