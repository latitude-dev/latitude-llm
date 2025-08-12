'use server'

import { IntegrationsRepository } from '@latitude-data/core/repositories/integrationsRepository'
import { destroyIntegration } from '@latitude-data/core/services/integrations/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyIntegrationAction = authProcedure
  .inputSchema(z.object({ id: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const integrationsRepo = new IntegrationsRepository(ctx.workspace.id)
    const integration = await integrationsRepo
      .find(parsedInput.id)
      .then((r) => r.unwrap())

    return destroyIntegration(integration).then((r) => r.unwrap())
  })
