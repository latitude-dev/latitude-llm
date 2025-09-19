import { PromptSource, Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { resolveClientTools } from './clientTools'
import { resolveLatitudeTools } from './latitudeTools'
import { resolveAgentsAsTools } from './agentsAsTools'
import { resolveIntegrationTools } from './integrationTools'
import { Result } from '../../../../lib/Result'
import { LatitudeError } from '../../../../lib/errors'
import { resolveAgentReturnTool } from './agentReturnTool'
import { ResolvedTools } from './types'
import { ChainStreamManager } from '..'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { resolveProviderTools } from './resolveProviderTools'

export async function resolveToolsFromConfig({
  workspace,
  promptSource,
  config,
  injectAgentFinishTool,
  chainStreamManager,
}: {
  workspace: Workspace
  promptSource: PromptSource
  config: LatitudePromptConfig
  injectAgentFinishTool?: boolean
  chainStreamManager?: ChainStreamManager
}): PromisedResult<ResolvedTools, LatitudeError> {
  const clientToolsResult = resolveClientTools({ config })
  if (!Result.isOk(clientToolsResult)) return clientToolsResult

  const latitudeToolsResult = resolveLatitudeTools({ config })
  if (!Result.isOk(latitudeToolsResult)) return latitudeToolsResult

  const agentsAsToolsResult = await resolveAgentsAsTools({
    workspace,
    promptSource,
    config,
  })
  if (!Result.isOk(agentsAsToolsResult)) return agentsAsToolsResult

  const integrationToolsResult = await resolveIntegrationTools({
    workspace,
    config,
    chainStreamManager,
  })

  if (!Result.isOk(integrationToolsResult)) return integrationToolsResult

  const agentReturnResult = resolveAgentReturnTool({
    config,
    injectAgentFinishTool,
  })

  if (!Result.isOk(agentReturnResult)) return agentReturnResult

  const providerToolsResult = resolveProviderTools({ config })
  if (!Result.isOk(providerToolsResult))
    return Result.error(providerToolsResult.error)

  return Result.ok(
    Object.assign(
      clientToolsResult.value,
      latitudeToolsResult.value,
      agentsAsToolsResult.value,
      integrationToolsResult.value,
      agentReturnResult.value,
      providerToolsResult.value,
    ),
  )
}
