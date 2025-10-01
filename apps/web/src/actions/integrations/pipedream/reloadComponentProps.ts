'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { reloadComponentProps } from '@latitude-data/core/services/integrations/pipedream/components/reloadComponentProps'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { IntegrationType } from '@latitude-data/constants'

export const reloadPipedreamComponentPropsAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      integrationName: z.string(),
      componentId: z.string(),
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

    return reloadComponentProps({
      integration,
      componentId: input.componentId,
      configuredProps: input.configuredProps ?? {},
    }).then((r) => r.unwrap())
  })
