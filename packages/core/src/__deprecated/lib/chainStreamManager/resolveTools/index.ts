import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ChainStreamManager } from '..'
import { PromptSource, Workspace } from '../../../../browser'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import { LatitudeError } from '../../../../lib/errors'
import { resolveAgentReturnTool } from './agentReturnTool'
import { resolveAgentsAsTools } from './agentsAsTools'
import { resolveClientTools } from './clientTools'
import { resolveIntegrationTools } from './integrationTools'
import { resolveLatitudeTools } from './latitudeTools'
import { resolveProviderTools } from './resolveProviderTools'
import { ResolvedTools } from './types'

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
    chainStreamManager,
  })

  if (integrationToolsResult.error) return integrationToolsResult

  const agentReturnResult = resolveAgentReturnTool({
    config,
    injectAgentFinishTool,
  })

  if (agentReturnResult.error) return agentReturnResult

  const providerToolsResult = resolveProviderTools({ config })
  if (providerToolsResult.error) return Result.error(providerToolsResult.error)

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
