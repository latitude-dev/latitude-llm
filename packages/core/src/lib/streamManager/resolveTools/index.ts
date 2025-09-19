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
  if (!Result.isOk(clientToolsResult)) return clientToolsResult

  const latitudeToolsResult = resolveLatitudeTools({ config, streamManager })
  if (!Result.isOk(latitudeToolsResult)) return latitudeToolsResult

  const agentsAsToolsResult = await resolveAgentsAsTools({
    config,
    streamManager,
  })
  if (!Result.isOk(agentsAsToolsResult)) return agentsAsToolsResult

  let integrationToolsResult
  if (streamManager) {
    integrationToolsResult = await resolveIntegrationTools({
      config,
      streamManager: streamManager,
    })
    if (!Result.isOk(integrationToolsResult)) return integrationToolsResult
  }

  const providerToolsResult = resolveProviderTools({ config })
  if (!Result.isOk(providerToolsResult))
    return Result.error(providerToolsResult.error)

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
