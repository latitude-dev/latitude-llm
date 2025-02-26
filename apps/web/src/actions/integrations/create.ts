'use server'

import { createIntegration } from '@latitude-data/core/services/integrations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { IntegrationType } from '@latitude-data/constants'
import {
  customMcpConfigurationSchema,
  insertMCPServerConfigurationSchema,
} from '@latitude-data/core/services/integrations/helpers/schema'

export const createIntegrationAction = authProcedure
  .createServerAction()
  .input(
    z.discriminatedUnion('type', [
      z.object({
        name: z.string(),
        type: z.literal(IntegrationType.CustomMCP),
        configuration: customMcpConfigurationSchema,
      }),
      z.object({
        name: z.string(),
        type: z.literal(IntegrationType.MCPServer),
        configuration: insertMCPServerConfigurationSchema,
      }),
    ]),
  )
  .handler(
    async ({ input, ctx }) =>
      await createIntegration<typeof input.type>({
        workspace: ctx.workspace,
        name: input.name,
        type: input.type,
        configuration: input.configuration,
        author: ctx.user,
      }).then((r) => r.unwrap()),
  )
