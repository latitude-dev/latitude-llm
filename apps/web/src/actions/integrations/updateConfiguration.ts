'use server'

import { z } from 'zod'

import { authProcedure } from '../procedures'
import { pipedreamIntegrationConfigurationSchema } from '@latitude-data/core/services/integrations/helpers/schema'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { updateIntegrationConfiguration } from '@latitude-data/core/services/integrations/updateConfiguration'

export const updateIntegrationConfigurationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      integrationName: z.string(),
      configuration: pipedreamIntegrationConfigurationSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { integrationName, configuration } = input
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
