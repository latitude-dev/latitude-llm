'use server'

import { createConnectToken } from '@latitude-data/core/services/integrations/pipedream/createConnectToken'
import { authProcedure } from '../../procedures'

export const createPipedreamTokenAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    return createConnectToken({ workspace: ctx.workspace }).then((r) =>
      r.unwrap(),
    )
  })
