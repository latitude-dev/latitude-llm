'use server'

import { z } from 'zod'

import { authProcedure } from '../procedures'
import { pipedreamIntegrationConfigurationSchema } from '@latitude-data/core/services/integrations/helpers/schema'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { updateIntegrationConfiguration } from '@latitude-data/core/services/integrations/updateConfiguration'

export const updateIntegrationConfigurationAction = authProcedure
  .inputSchema(
    z.object({
      integrationName: z.string(),
      configuration: pipedreamIntegrationConfigurationSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { integrationName, configuration } = parsedInput
    const { workspace } = ctx

    const integrationsScope = new IntegrationsRepository(workspace.id)
    const integrationResult =
      await integrationsScope.findByName(integrationName)
    const integration = integrationResult.unwrap()

    const result = await updateIntegrationConfiguration({
      integration,
      configuration,
    })

    return result.unwrap()
  })
