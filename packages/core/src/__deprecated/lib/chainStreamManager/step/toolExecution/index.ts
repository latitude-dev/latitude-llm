import { ToolCall, ToolMessage } from '@latitude-data/compiler'
import { ChainStreamManager } from '../..'
import { Workspace } from '../../../../../browser'
import { PromptSource } from '../../../../../constants'
import { createMcpClientManager } from '../../../../../services/integrations/McpClient/McpClientManager'
import { buildToolMessage } from '../../../../../services/latitudeTools/helpers'
import { telemetry, TelemetryContext } from '../../../../../telemetry'
import { Result } from '../../../../../lib/Result'
import { PromisedResult } from '../../../../../lib/Transaction'
import { NotFoundError } from '../../../../../lib/errors'
import { ResolvedTools, ToolSource } from '../../resolveTools/types'
import { getAgentReturnToolCallsResults } from './agentReturn'
import { getAgentsAsToolCallsResults } from './agentsAsTools'
import { getIntegrationToolCallResults } from './integrationTools'
import { getLatitudeCallResults } from './latitudeTools'
import { ToolResponsesArgs } from './types'

export function getBuiltInToolCallResponses({
  context,
  workspace,
  promptSource,
  resolvedTools,
  toolCalls,
  onFinish,
  chainStreamManager,
  mcpClientManager,
}: {
  context: TelemetryContext
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

    const $tools: ReturnType<typeof telemetry.tool>[] = []
    for (const toolCall of toolCalls) {
      $tools.push(
        telemetry.tool(context, {
          name: toolCall.name,
          call: {
            id: toolCall.id,
            arguments: toolCall.arguments,
          },
        }),
      )
    }

    const results = callback({
      contexts: $tools.map(($tool) => $tool.context),
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

      $tools[idx]!.end({
        result: {
          value: result.value ?? result.error?.message,
          isError: !result.ok,
        },
      })

      // TODO(compiler): fix types
      // @ts-expect-error - TODO: fix types
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
