'use server'

import { authProcedure } from '../../procedures'
import { createConnectToken } from '@latitude-data/core/services/integrations/pipedream/createConnectToken'

export const createPipedreamTokenAction = authProcedure.action(
  async ({ ctx }) => {
    return createConnectToken({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())
  },
)
