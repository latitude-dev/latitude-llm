import type { ToolCall, ToolMessage } from '@latitude-data/compiler'
import type { ChainStreamManager } from '../..'
import type { Workspace } from '../../../../../browser'
import type { PromptSource } from '../../../../../constants'
import type { createMcpClientManager } from '../../../../../services/integrations/McpClient/McpClientManager'
import { buildToolMessage } from '../../../../../services/latitudeTools/helpers'
import { Result } from '../../../../../lib/Result'
import type { PromisedResult } from '../../../../../lib/Transaction'
import { NotFoundError } from '../../../../../lib/errors'
import { type ResolvedTools, ToolSource } from '../../resolveTools/types'
import { getAgentReturnToolCallsResults } from './agentReturn'
import { getAgentsAsToolCallsResults } from './agentsAsTools'
import { getIntegrationToolCallResults } from './integrationTools'
import { getLatitudeCallResults } from './latitudeTools'
import type { ToolResponsesArgs } from './types'

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
      const result = await promisedResult

      const message = buildToolMessage({
        toolName: toolCalls[idx]!.name,
        toolId: toolCalls[idx]!.id,
        result: result,
      })

      // TODO(compiler): fix types
      // @ts-expect-error - TODO: fix types
      onFinish(message)
      return message
    })
  }

  const latitudeToolResults = executeTools(getLatitudeCallResults, latitudeToolCalls)
  const agentToolResults = executeTools(getAgentReturnToolCallsResults, agentReturnToolCalls)
  const agentAsToolResults = executeTools(getAgentsAsToolCallsResults, agentAsToolCalls)
  const integrationToolResults = executeTools(getIntegrationToolCallResults, integrationToolCalls)
  const otherToolResults = executeTools(
    ({ toolCalls }) =>
      toolCalls.map(async (toolCall) =>
        Result.error(new NotFoundError(`Unknown tool '${toolCall.name}'`)),
      ),
    unknownToolCalls,
  )

  // TODO(compiler): fix types
  // @ts-expect-error - TODO: fix types
  return [
    ...latitudeToolResults,
    ...agentToolResults,
    ...agentAsToolResults,
    ...integrationToolResults,
    ...otherToolResults,
  ]
}
