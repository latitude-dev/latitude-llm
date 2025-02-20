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
  messages,
  config: originalConfig,
}: {
  workspace: Workspace
  promptSource: PromptSource
  messages: Message[]
  config: Config
}): PromisedResult<{
  messages: Message[]
  config: Config
}> {
  let config = originalConfig
  const agentsAsToolsResult = await getAgentAsTools({
    workspace,
    config,
    promptSource,
  })
  if (agentsAsToolsResult.error) return agentsAsToolsResult
  config = agentsAsToolsResult.unwrap()

  return Result.ok({
    messages,
    config,
  })
}
