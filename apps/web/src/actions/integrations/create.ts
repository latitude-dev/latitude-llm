'use server'

import { createIntegration } from '@latitude-data/core/services/integrations/create'
import { z } from 'zod'

import { IntegrationType } from '@latitude-data/constants'
import {
  externalMcpIntegrationConfigurationSchema,
  pipedreamIntegrationConfigurationSchema,
} from '@latitude-data/core/services/integrations/helpers/schema'
import { authProcedure } from '../procedures'

const nameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !name.includes(' '), {
    error: 'Name cannot contain spaces',
  })
  .refine((name) => !name.includes('/'), {
    error: 'Name cannot contain slashes',
  })

const integrationSchema = z.discriminatedUnion('type', [
  z.object({
    name: nameSchema,
    type: z.literal(IntegrationType.ExternalMCP),
    configuration: externalMcpIntegrationConfigurationSchema,
  }),
  z.object({
    name: nameSchema,
    type: z.literal(IntegrationType.Pipedream),
    configuration: pipedreamIntegrationConfigurationSchema,
  }),
])

export const createIntegrationAction = authProcedure
  .inputSchema(integrationSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await createIntegration<typeof parsedInput.type>({
      workspace: ctx.workspace,
      name: parsedInput.name,
      type: parsedInput.type,
      configuration: parsedInput.configuration,
      author: ctx.user,
    }).then((r) => r.unwrap())

    return result
  })
