import { Message } from '@latitude-data/compiler'
import { Config, ToolDefinition } from '@latitude-data/constants'
import { PromisedResult } from '../../Transaction'
import { Result } from '../../Result'
import {
  DocumentRunPromptSource,
  PromptSource,
  Workspace,
} from '../../../browser'
import { buildAgentsAsToolsDefinition } from '../../../services/agents/agentsAsTools'
import { performAgentInjection } from '../../../services/agents/promptInjection'

async function getAgentAsTools({
  workspace,
  config,
  promptSource,
}: {
  workspace: Workspace
  config: Config
  promptSource: PromptSource
}): PromisedResult<Config> {
  // Only if the prompt source is a document
  if (!('commit' in promptSource)) {
    return Result.ok(config)
  }

  if (!config.agents?.length) {
    return Result.ok(config)
  }

  const result = await buildAgentsAsToolsDefinition({
    workspace,
    config,
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
  config: Config
  injectFakeAgentStartTool?: boolean
  injectAgentFinishTool?: boolean
}): PromisedResult<{
  messages: Message[]
  config: Config
}> {
  let config = originalConfig
  let messages = originalMessages

  const agentsAsToolsResult = await getAgentAsTools({
    workspace,
    config,
    promptSource,
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
