import { ToolCall, ToolMessage } from '@latitude-data/compiler'
import { PromptSource } from '../../../../constants'
import { buildToolMessage } from '../../../../services/latitudeTools/helpers'
import { Result } from '../../../Result'
import { NotFoundError } from '../../../errors'
import { Workspace } from '../../../../browser'
import { PromisedResult } from '../../../Transaction'
import { ToolResponsesArgs } from './types'
import { getLatitudeCallResults } from './latitudeTools'
import { getAgentsAsToolCallsResults } from './agentsAsTools'
import { getIntegrationToolCallResults } from './integrationTools'
import { getAgentReturnToolCallsResults } from './agentReturn'
import { ResolvedTools, ToolSource } from '../../resolveTools/types'
import { createMcpClientManager } from '../../../../services/integrations/McpClient/McpClientManager'
import { ChainStreamManager } from '../..'

export function getBuiltInToolCallResponses({
  workspace,
  promptSource,
  resolvedTools,
  toolCalls,
  onFinish,
  chainStreamManager,
  mcpClientManager,
}: {
  workspace: Workspace
  promptSource: PromptSource
  resolvedTools: ResolvedTools
  toolCalls: ToolCall[]
  onFinish: (toolMessage: ToolMessage) => void
  chainStreamManager?: ChainStreamManager
  mcpClientManager?: ReturnType<typeof createMcpClientManager>
}): Promise<ToolMessage>[] {
  // Split tool calls into Latitude, Agent, Integration, and Unknown tools
  const [
    latitudeToolCalls,
    agentReturnToolCalls,
    agentAsToolCalls,
    integrationToolCalls,
    unknownToolCalls,
  ] = toolCalls.reduce(
    (
      [
        latitudeToolCalls,
        agentReturnToolCalls,
        agentAsToolCalls,
        integrationToolCalls,
        unknownToolCalls,
      ]: [ToolCall[], ToolCall[], ToolCall[], ToolCall[], ToolCall[]],
      toolCall,
    ) => {
      const toolSource = resolvedTools[toolCall.name]?.sourceData.source
      if (toolSource === ToolSource.Latitude) {
        latitudeToolCalls.push(toolCall)
      } else if (toolSource === ToolSource.AgentReturn) {
        agentReturnToolCalls.push(toolCall)
      } else if (toolSource === ToolSource.AgentAsTool) {
        agentAsToolCalls.push(toolCall)
      } else if (toolSource === ToolSource.Integration) {
        integrationToolCalls.push(toolCall)
      } else {
        unknownToolCalls.push(toolCall)
      }

      return [
        latitudeToolCalls,
        agentReturnToolCalls,
        agentAsToolCalls,
        integrationToolCalls,
        unknownToolCalls,
      ]
    },
    [[], [], [], [], []],
  )

  const executeTools = (
    callback: (_: ToolResponsesArgs) => PromisedResult<unknown>[],
    toolCalls: ToolCall[],
  ) => {
    if (!toolCalls.length) return []
    const results = callback({
      workspace,
      promptSource,
      resolvedTools,
      toolCalls,
      chainStreamManager,
      mcpClientManager,
    })
    return results.map(async (promisedResult, idx) => {
      const message = buildToolMessage({
        toolName: toolCalls[idx]!.name,
        toolId: toolCalls[idx]!.id,
        result: await promisedResult,
      })
      onFinish(message)
      return message
    })
  }

  const latitudeToolResults = executeTools(
    getLatitudeCallResults,
    latitudeToolCalls,
  )
  const agentToolResults = executeTools(
    getAgentReturnToolCallsResults,
    agentReturnToolCalls,
  )
  const agentAsToolResults = executeTools(
    getAgentsAsToolCallsResults,
    agentAsToolCalls,
  )
  const integrationToolResults = executeTools(
    getIntegrationToolCallResults,
    integrationToolCalls,
  )
  const otherToolResults = executeTools(
    ({ toolCalls }) =>
      toolCalls.map(async (toolCall) =>
        Result.error(new NotFoundError(`Unknown tool '${toolCall.name}'`)),
      ),
    unknownToolCalls,
  )

  return [
    ...latitudeToolResults,
    ...agentToolResults,
    ...agentAsToolResults,
    ...integrationToolResults,
    ...otherToolResults,
  ]
}
