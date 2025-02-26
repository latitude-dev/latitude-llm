'use server'

import { createIntegration } from '@latitude-data/core/services/integrations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { IntegrationType } from '@latitude-data/constants'
import { customMcpConfigurationSchema } from '@latitude-data/core/services/integrations/helpers/schema'

export const createIntegrationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      type: z.nativeEnum(IntegrationType),
      configuration: customMcpConfigurationSchema,
    }),
  )
  .handler(
    async ({ input, ctx }) =>
      await createIntegration({
        workspace: ctx.workspace,
        name: input.name,
        type: input.type,
        configuration: input.configuration,
        author: ctx.user,
      }).then((r) => r.unwrap()),
  )
