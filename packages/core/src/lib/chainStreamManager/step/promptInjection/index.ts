import { Message } from '@latitude-data/compiler'
import {
  PromptConfig,
  ToolDefinition,
  VercelConfig,
} from '@latitude-data/constants'
import { PromisedResult } from '../../../Transaction'
import { Result } from '../../../Result'
import {
  DocumentRunPromptSource,
  PromptSource,
  Workspace,
} from '../../../../browser'
import { buildAgentsAsToolsDefinition } from '../../../../services/agents/agentsAsTools'
import { performAgentInjection } from '../../../../services/agents/promptInjection'
import { injectCorrectToolsConfig } from './tools'

async function getAgentAsTools({
  workspace,
  config,
  promptSource,
  agents,
}: {
  workspace: Workspace
  config: VercelConfig
  promptSource: PromptSource
  agents: string[]
}): PromisedResult<VercelConfig> {
  // Only if the prompt source is a document
  if (!('commit' in promptSource)) {
    return Result.ok(config)
  }

  if (!agents.length) {
    return Result.ok(config)
  }

  const result = await buildAgentsAsToolsDefinition({
    workspace,
    agents,
    ...(promptSource as DocumentRunPromptSource),
  })
  if (result.error) return result

  const newTools: Record<string, ToolDefinition> = {
    ...(config.tools ?? {}),
    ...result.unwrap(),
  }

  return Result.ok({
    ...config,
    tools: newTools,
  })
}

export async function performPromptInjection({
  workspace,
  promptSource,
  messages: originalMessages,
  config: originalConfig,
  injectFakeAgentStartTool,
  injectAgentFinishTool,
}: {
  workspace: Workspace
  promptSource: PromptSource
  messages: Message[]
  config: PromptConfig
  injectFakeAgentStartTool?: boolean
  injectAgentFinishTool?: boolean
}): PromisedResult<{
  messages: Message[]
  config: VercelConfig
}> {
  let config = originalConfig
  let messages = originalMessages

  const latitudeToolsInjectionResult = injectCorrectToolsConfig(config)
  if (latitudeToolsInjectionResult.error) return latitudeToolsInjectionResult
  config = latitudeToolsInjectionResult.unwrap()

  const agentsAsToolsResult = await getAgentAsTools({
    workspace,
    config,
    promptSource,
    agents: originalConfig.agents ?? [],
  })
  if (agentsAsToolsResult.error) return agentsAsToolsResult
  config = agentsAsToolsResult.unwrap()

  const agentInjectionResult = performAgentInjection({
    messages,
    config,
    injectAgentFinishTool,
    injectFakeAgentStartTool,
  })
  if (agentInjectionResult.error) return agentInjectionResult
  config = agentInjectionResult.unwrap().config
  messages = agentInjectionResult.unwrap().messages

  return Result.ok({
    messages,
    config,
  })
}
