import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { StreamManager } from '..'
import { Result } from '../../Result'
import { PromisedResult } from '../../Transaction'
import { LatitudeError } from '../../errors'
import { resolveAgentsAsTools } from './agentsAsTools'
import { resolveClientTools } from './clientTools'
import { resolveIntegrationTools } from './integrationTools'
import { resolveLatitudeTools } from './latitudeTools'
import { resolveProviderTools } from './resolveProviderTools'
import { ResolvedTools } from './types'

export async function resolveToolsFromConfig({
  config,
  streamManager,
}: {
  config: LatitudePromptConfig
  streamManager: StreamManager
}): PromisedResult<ResolvedTools, LatitudeError> {
  const clientToolsResult = resolveClientTools({
    config,
    streamManager,
  })
  if (clientToolsResult.error) return clientToolsResult

  const latitudeToolsResult = resolveLatitudeTools({ config, streamManager })
  if (latitudeToolsResult.error) return latitudeToolsResult

  const agentsAsToolsResult = await resolveAgentsAsTools({
    config,
    streamManager,
  })
  if (agentsAsToolsResult.error) return agentsAsToolsResult

  let integrationToolsResult
  if (streamManager) {
    integrationToolsResult = await resolveIntegrationTools({
      config,
      streamManager: streamManager,
    })
    if (integrationToolsResult.error) return integrationToolsResult
  }

  const providerToolsResult = resolveProviderTools({ config })
  if (providerToolsResult.error) return Result.error(providerToolsResult.error)

  return Result.ok(
    Object.assign(
      clientToolsResult.value,
      latitudeToolsResult.value,
      agentsAsToolsResult.value,
      integrationToolsResult!.value,
      providerToolsResult.value,
    ),
  )
}
