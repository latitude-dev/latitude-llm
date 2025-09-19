import { z } from 'zod'
import { defineLatteTool } from '../types'
import { Result } from '../../../../../lib/Result'
import { getPipedreamClient } from '../../../../integrations/pipedream/apps'
import { IntegrationsRepository } from '../../../../../repositories'
import {
  ConfigurablePropWithRemoteOptions,
  PipedreamIntegration,
} from '../../../../../browser'
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

    const integrationScope = new IntegrationsRepository(workspace.id)
    const integrationResult = await integrationScope.find(integrationId)

    if (!Result.isOk(integrationResult)) {
      return Result.error(integrationResult.error)
    }

    const integration = integrationResult.unwrap() as PipedreamIntegration

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
