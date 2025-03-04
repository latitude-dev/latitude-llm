'use server'

import { createIntegration } from '@latitude-data/core/services/integrations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { IntegrationType } from '@latitude-data/constants'
import {
  externalMcpIntegrationConfigurationSchema,
  hostedMcpIntegrationConfigurationFormSchema,
} from '@latitude-data/core/services/integrations/helpers/schema'
import { Workspace } from '@latitude-data/core/browser'
import { IntegrationsRepository } from '@latitude-data/core/repositories'

const nameSchema = (workspace: Workspace) =>
  z
    .string()
    .min(1)
    .max(255)
    .refine((name) => !name.includes(' '), {
      message: 'Name cannot contain spaces',
    })
    .refine((name) => !name.includes('/'), {
      message: 'Name cannot contain slashes',
    })
    .refine((name) => name !== 'latitude', {
      message: 'An integration with this name already exists',
    })
    .refine(
      async (name) => {
        const integrationsScope = new IntegrationsRepository(workspace.id)
        const integration = await integrationsScope.findByName(name)
        return !integration.ok
      },
      { message: 'An integration with this name already exists' },
    )

export const createIntegrationAction = authProcedure
  .createServerAction()
  .input(async ({ ctx }) =>
    z.discriminatedUnion('type', [
      z.object({
        name: nameSchema(ctx.workspace),
        type: z.literal(IntegrationType.ExternalMCP),
        configuration: externalMcpIntegrationConfigurationSchema,
      }),
      z.object({
        name: nameSchema(ctx.workspace),
        type: z.literal(IntegrationType.HostedMCP),
        configuration: hostedMcpIntegrationConfigurationFormSchema,
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
