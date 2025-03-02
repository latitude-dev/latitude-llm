import { PromptSource, Workspace } from '../../../browser'
import { PromisedResult } from '../../Transaction'
import { resolveClientTools } from './clientTools'
import { resolveLatitudeTools } from './latitudeTools'
import { PromptConfig } from '@latitude-data/constants'
import { resolveAgentsAsTools } from './agentsAsTools'
import { resolveIntegrationTools } from './integrationTools'
import { Result } from '../../Result'
import { LatitudeError } from '../../errors'
import { resolveAgentReturnTool } from './agentReturnTool'
import { ResolvedTools } from './types'

export async function resolveToolsFromConfig({
  workspace,
  promptSource,
  config,
  injectAgentFinishTool,
}: {
  workspace: Workspace
  promptSource: PromptSource
  config: PromptConfig
  injectAgentFinishTool?: boolean
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
  })
  if (integrationToolsResult.error) return integrationToolsResult

  const agentReturnResult = resolveAgentReturnTool({
    config,
    injectAgentFinishTool,
  })
  if (agentReturnResult.error) return agentReturnResult

  return Result.ok(
    Object.assign(
      clientToolsResult.unwrap(),
      latitudeToolsResult.unwrap(),
      agentsAsToolsResult.unwrap(),
      integrationToolsResult.unwrap(),
      agentReturnResult.unwrap(),
    ),
  )
}
