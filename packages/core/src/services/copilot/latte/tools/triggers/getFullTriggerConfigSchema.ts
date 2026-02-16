import { z } from 'zod'
import { defineLatteTool } from '../types'
import { Result } from '../../../../../lib/Result'
import { getPipedreamClient } from '../../../../integrations/pipedream/apps'
import { findIntegrationById } from '../../../../../queries/integrations/findById'
import { ConfigurablePropWithRemoteOptions } from '../../../../../constants'
import { PipedreamIntegration } from '../../../../../schema/models/types/Integration'
import { fetchFullConfigSchema } from './fetchFullConfigSchema'
import { PromisedResult } from '../../../../../lib/Transaction'

export const getFullTriggerConfigSchema = defineLatteTool(
  async (
    { componentId, integrationId },
    { workspace },
  ): PromisedResult<ConfigurablePropWithRemoteOptions[]> => {
    const pipedreamResult = getPipedreamClient()
    if (!Result.isOk(pipedreamResult)) return pipedreamResult
    const pipedream = pipedreamResult.unwrap()

    let integration: PipedreamIntegration
    try {
      integration = (await findIntegrationById({
        workspaceId: workspace.id,
        id: integrationId,
      })) as PipedreamIntegration
    } catch (e) {
      return Result.error(e as Error)
    }

    return await fetchFullConfigSchema({
      pipedream,
      componentId,
      integration,
    })
  },
  z.object({
    componentId: z.string(),
    integrationId: z.number(),
  }),
)
