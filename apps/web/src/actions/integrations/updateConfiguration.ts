'use server'

import { z } from 'zod'

import { authProcedure } from '../procedures'
import { pipedreamIntegrationConfigurationSchema } from '@latitude-data/core/services/integrations/helpers/schema'
import { findIntegrationByName } from '@latitude-data/core/queries/integrations/findByName'
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

    const integration = await findIntegrationByName({
      workspaceId: workspace.id,
      name: integrationName,
    })

    const result = await updateIntegrationConfiguration({
      integration,
      configuration,
    })

    return result.unwrap()
  })
