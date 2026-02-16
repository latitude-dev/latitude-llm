'use server'

import { findIntegrationById } from '@latitude-data/core/queries/integrations/findById'
import { destroyIntegration } from '@latitude-data/core/services/integrations/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyIntegrationAction = authProcedure
  .inputSchema(z.object({ id: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const integration = await findIntegrationById({
      workspaceId: ctx.workspace.id,
      id: parsedInput.id,
    })

    return destroyIntegration(integration).then((r) => r.unwrap())
  })
