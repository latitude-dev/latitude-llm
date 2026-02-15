'use server'

import { reauthorizeIntegration } from '@latitude-data/core/services/integrations/reauthorize'
import { findIntegrationById } from '@latitude-data/core/queries/integrations/findById'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const reauthorizeIntegrationAction = authProcedure
  .inputSchema(z.object({ integrationId: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const integration = await findIntegrationById({
      workspaceId: ctx.workspace.id,
      id: parsedInput.integrationId,
    })

    const result = await reauthorizeIntegration({
      integration,
      authorId: ctx.user.id,
    }).then((r) => r.unwrap())

    return { oauthRedirectUrl: result }
  })
