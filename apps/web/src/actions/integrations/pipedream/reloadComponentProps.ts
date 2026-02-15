'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { reloadComponentProps } from '@latitude-data/core/services/integrations/pipedream/components/reloadComponentProps'
import { findIntegrationByName } from '@latitude-data/core/queries/integrations/findByName'
import { IntegrationType } from '@latitude-data/constants'

export const reloadPipedreamComponentPropsAction = authProcedure
  .inputSchema(
    z.object({
      integrationName: z.string(),
      componentId: z.string(),
      configuredProps: z.record(z.string(), z.any()).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const integration = await findIntegrationByName({
      workspaceId: ctx.workspace.id,
      name: parsedInput.integrationName,
    })

    if (integration.type !== IntegrationType.Pipedream) {
      throw new Error('Integration is not a Pipedream integration')
    }

    return reloadComponentProps({
      integration,
      componentId: parsedInput.componentId,
      configuredProps: parsedInput.configuredProps ?? {},
    }).then((r) => r.unwrap())
  })
