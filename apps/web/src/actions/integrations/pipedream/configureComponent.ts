'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { IntegrationType } from '@latitude-data/constants'
import { configureComponent } from '@latitude-data/core/services/integrations/pipedream/components/configureComponent'

export const configurePipedreamComponentAction = authProcedure
  .inputSchema(
    z.object({
      integrationName: z.string(),
      componentId: z.string(),
      propName: z.string(),
      configuredProps: z.record(z.string(), z.any()).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const integrationScope = new IntegrationsRepository(ctx.workspace.id)
    const integrationResult = await integrationScope.findByName(
      parsedInput.integrationName,
    )
    const integration = integrationResult.unwrap()

    if (integration.type !== IntegrationType.Pipedream) {
      throw new Error('Integration is not a Pipedream integration')
    }

    return configureComponent({
      integration,
      componentId: parsedInput.componentId,
      propName: parsedInput.propName,
      configuredProps: parsedInput.configuredProps,
    }).then((r) => r.unwrap())
  })
