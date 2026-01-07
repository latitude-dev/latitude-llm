'use server'

import { reauthorizeIntegration } from '@latitude-data/core/services/integrations/reauthorize'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const reauthorizeIntegrationAction = authProcedure
  .inputSchema(z.object({ integrationId: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const repo = new IntegrationsRepository(ctx.workspace.id)
    const integration = await repo
      .find(parsedInput.integrationId)
      .then((r) => r.unwrap())

    const result = await reauthorizeIntegration({
      integration,
      authorId: ctx.user.id,
    }).then((r) => r.unwrap())

    return { oauthRedirectUrl: result }
  })
