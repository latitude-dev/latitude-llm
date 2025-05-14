import { PromptSource, Workspace } from '../../../browser'
import { PromisedResult } from '../../Transaction'
import { resolveClientTools } from './clientTools'
import { resolveLatitudeTools } from './latitudeTools'
import { resolveAgentsAsTools } from './agentsAsTools'
import { resolveIntegrationTools } from './integrationTools'
import { Result } from '../../Result'
import { LatitudeError } from '../../errors'
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
