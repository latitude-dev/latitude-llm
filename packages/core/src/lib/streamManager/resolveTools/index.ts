import type { PromisedResult } from '../../Transaction'
import { resolveClientTools } from './clientTools'
import { resolveLatitudeTools } from './latitudeTools'
import { resolveAgentsAsTools } from './agentsAsTools'
import { resolveIntegrationTools } from './integrationTools'
import { Result } from '../../Result'
import type { LatitudeError } from '../../errors'
import type { ResolvedTools } from './types'
import type { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { resolveProviderTools } from './resolveProviderTools'
import type { StreamManager } from '..'

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
