'use server'

import { authProcedure } from '../../procedures'
import { createConnectToken } from '@latitude-data/core/services/integrations/pipedream/createConnectToken'

export const createPipedreamTokenAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    return createConnectToken({ workspace: ctx.workspace }).then((r) => r.unwrap())
  })
