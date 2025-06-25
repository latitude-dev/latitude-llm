import { PromptSource, Workspace } from '../../../browser'
import { PromisedResult } from '../../Transaction'
import { resolveClientTools } from './clientTools'
import { resolveLatitudeTools } from './latitudeTools'
import { resolveAgentsAsTools } from './agentsAsTools'
import { resolveIntegrationTools } from './integrationTools'
import { Result } from '../../Result'
import { LatitudeError } from '../../errors'
import { ResolvedTools } from './types'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { resolveProviderTools } from './resolveProviderTools'
import { StreamManager } from '..'
import { ChainStreamManager } from '../chainStreamManager'

export async function resolveToolsFromConfig({
  workspace,
  promptSource,
  config,
  streamManager,
}: {
  workspace: Workspace
  promptSource: PromptSource
  config: LatitudePromptConfig
  streamManager?: StreamManager
}): PromisedResult<ResolvedTools, LatitudeError> {
  const clientToolsResult = resolveClientTools({
    config,
    mockClientToolResults:
      streamManager instanceof ChainStreamManager
        ? streamManager.mockClientToolResults
        : false,
  })
  if (clientToolsResult.error) return clientToolsResult

  const latitudeToolsResult = resolveLatitudeTools({ config })
  if (latitudeToolsResult.error) return latitudeToolsResult

  const agentsAsToolsResult = await resolveAgentsAsTools({
    workspace,
    promptSource,
    config,
  })
  if (agentsAsToolsResult.error) return agentsAsToolsResult

  const integrationToolsResult = await resolveIntegrationTools({
    workspace,
    config,
    streamManager: streamManager,
    mcpClientManager: streamManager!.mcpClientManager,
  })
  if (integrationToolsResult.error) return integrationToolsResult

  const providerToolsResult = resolveProviderTools({ config })
  if (providerToolsResult.error) return Result.error(providerToolsResult.error)

  return Result.ok(
    Object.assign(
      clientToolsResult.value,
      latitudeToolsResult.value,
      agentsAsToolsResult.value,
      integrationToolsResult.value,
      providerToolsResult.value,
    ),
  )
}
