'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { IntegrationType } from '@latitude-data/constants'
import { configureComponent } from '@latitude-data/core/services/integrations/pipedream/components/configureComponent'

export const configurePipedreamComponentAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      integrationName: z.string(),
      componentId: z.string(),
      propName: z.string(),
      configuredProps: z.record(z.any()).optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const integrationScope = new IntegrationsRepository(ctx.workspace.id)
    const integrationResult = await integrationScope.findByName(
      input.integrationName,
    )
    const integration = integrationResult.unwrap()

    if (integration.type !== IntegrationType.Pipedream) {
      throw new Error('Integration is not a Pipedream integration')
    }

    return configureComponent({
      integration,
      componentId: input.componentId,
      propName: input.propName,
      configuredProps: input.configuredProps,
    }).then((r) => r.unwrap())
  })
