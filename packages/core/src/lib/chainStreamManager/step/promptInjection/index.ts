import { Message } from '@latitude-data/compiler'
import { PromptConfig, VercelConfig } from '@latitude-data/constants'
import { PromisedResult } from '../../../Transaction'
import { Result } from '../../../Result'
import { performAgentInjection } from '../../../../services/agents/promptInjection'

export async function performPromptInjection({
  messages: originalMessages,
  config: originalConfig,
  injectFakeAgentStartTool,
  injectAgentFinishTool,
}: {
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
