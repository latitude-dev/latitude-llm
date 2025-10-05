'use server'

import { authProcedure } from '../../procedures'
import { createConnectToken } from '@latitude-data/core/services/integrations/pipedream/createConnectToken'
import { z } from 'zod'

export const createPipedreamTokenAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      externalUserId: z.string(),
    }),
  )
  .handler(async ({ ctx }) =>
    createConnectToken({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap()),
  )
