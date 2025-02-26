import { ToolCall, ToolMessage } from '@latitude-data/compiler'
import { PromptSource } from '../../../../constants'
import { ResolvedTools, ToolSource } from '../../resolveTools/types'
import { buildToolMessage } from '../../../../services/latitudeTools/helpers'
import { Result } from '../../../Result'
import { NotFoundError } from '../../../errors'
import { Workspace } from '../../../../browser'
import { PromisedResult } from '../../../Transaction'
import { ToolResponsesArgs } from './types'
import { getLatitudeCallResults } from './latitudeTools'
import { getAgentsAsToolCallsResults } from './agentsAsTools'
import { getIntegrationToolCallResults } from './integrationTools'

export function getBuiltInToolCallResponses({
  workspace,
  promptSource,
  resolvedTools,
  toolCalls,
  onFinish,
}: {
  workspace: Workspace
  promptSource: PromptSource
  resolvedTools: ResolvedTools
  toolCalls: ToolCall[]
  onFinish: (toolMessage: ToolMessage) => void
}): Promise<ToolMessage>[] {
  // Split tool calls into Latitude, Agent, Integration, and Unknown tools
  const [
    latitudeToolCalls,
    agentToolCalls,
    integrationToolCalls,
    unknownToolCalls,
  ] = toolCalls.reduce(
    (
      [
        latitudeToolCalls,
        agentToolCalls,
        integrationToolCalls,
        unknownToolCalls,
      ]: [ToolCall[], ToolCall[], ToolCall[], ToolCall[]],
      toolCall,
    ) => {
      const toolSource = resolvedTools[toolCall.name]?.sourceData.source
      if (toolSource === ToolSource.Latitude) {
        latitudeToolCalls.push(toolCall)
      } else if (toolSource === ToolSource.Agent) {
        agentToolCalls.push(toolCall)
      } else if (toolSource === ToolSource.Integration) {
        integrationToolCalls.push(toolCall)
      } else {
        unknownToolCalls.push(toolCall)
      }

      return [
        latitudeToolCalls,
        agentToolCalls,
        integrationToolCalls,
        unknownToolCalls,
      ]
    },
    [[], [], [], []],
  )

  const executeTools = (
    callback: (_: ToolResponsesArgs) => PromisedResult<unknown>[],
    toolCalls: ToolCall[],
  ) => {
    const results = callback({
      workspace,
      promptSource,
      resolvedTools,
      toolCalls,
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
    getAgentsAsToolCallsResults,
    agentToolCalls,
  )
  const integrationToolResults = executeTools(
    getIntegrationToolCallResults,
    integrationToolCalls,
  )
  const otherToolResults = executeTools(
    ({ toolCalls }) =>
      toolCalls.map(async () =>
        Result.error(new NotFoundError(`Unknown tool`)),
      ),
    unknownToolCalls,
  )

  return [
    ...latitudeToolResults,
    ...agentToolResults,
    ...integrationToolResults,
    ...otherToolResults,
  ]
}
