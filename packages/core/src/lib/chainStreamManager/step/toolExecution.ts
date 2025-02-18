import { ToolCall, ToolMessage } from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  DocumentRunPromptSource,
  LatitudeToolCall,
  LogSources,
  PromptSource,
} from '../../../constants'
import { executeLatitudeToolCall } from '../../../services/latitudeTools'
import { buildToolMessage } from '../../../services/latitudeTools/helpers'
import { Result } from '../../Result'
import { Workspace } from '../../../browser'
import { BadRequestError, NotFoundError } from '../../errors'
import { buildAgentsToolsMap } from '../../../services/agents/agentsAsTools'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { DocumentVersionsRepository } from '../../../repositories'

function isDocumentRun(
  promptSource: PromptSource,
): promptSource is DocumentRunPromptSource {
  return 'commit' in promptSource
}

export function getLatitudeToolCallResponses({
  toolCalls,
  onFinish,
}: {
  toolCalls: LatitudeToolCall[]
  onFinish: (toolMessage: ToolMessage) => void
}): Promise<ToolMessage>[] {
  return toolCalls.map(async (toolCall) => {
    let toolMessage: ToolMessage
    try {
      const result = await executeLatitudeToolCall(toolCall)
      toolMessage = buildToolMessage({
        toolName: toolCall.name,
        toolId: toolCall.id,
        result: result,
      })
    } catch (error) {
      toolMessage = buildToolMessage({
        toolName: toolCall.name,
        toolId: toolCall.id,
        result: Result.error(error as Error),
      })
    }
    onFinish(toolMessage)
    return toolMessage
  })
}

export async function getAgentAsToolCallResponses({
  workspace,
  promptSource,
  toolCalls,
  onFinish,
}: {
  workspace: Workspace
  promptSource: PromptSource
  toolCalls: ToolCall[]
  onFinish: (toolMessage: ToolMessage) => void
}): Promise<Promise<ToolMessage>[]> {
  const toolErrors = (error: Error) => {
    return toolCalls.map(async (toolCall) => {
      const toolMessage = buildToolMessage({
        toolName: toolCall.name,
        toolId: toolCall.id,
        result: Result.error(error),
      })
      onFinish(toolMessage)
      return toolMessage
    })
  }

  if (!isDocumentRun(promptSource)) {
    return toolErrors(
      new BadRequestError('Agents cannot be run in this context'),
    )
  }

  const { commit } = promptSource
  const agentToolsMapResult = await buildAgentsToolsMap({
    workspace,
    commit,
  })
  if (agentToolsMapResult.error) {
    return toolErrors(agentToolsMapResult.error)
  }
  const agentToolsMap = agentToolsMapResult.unwrap()

  const docsScope = new DocumentVersionsRepository(workspace.id)
  const allDocsResult = await docsScope.getDocumentsAtCommit(
    promptSource.commit,
  )
  if (allDocsResult.error) {
    return toolErrors(allDocsResult.error)
  }
  const allDocs = allDocsResult.unwrap()

  return toolCalls.map(async (toolCall) => {
    try {
      const agentPath = agentToolsMap[toolCall.name]
      const document = allDocs.find((doc) => doc.path === agentPath)
      if (!document) {
        throw new NotFoundError(
          `Agent not found for tool call: '${toolCall.name}'`,
        )
      }
      const result = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: toolCall.arguments,
        source: LogSources.AgentAsTool,
      })
      if (result.error) {
        throw result.error
      }

      const response = result.unwrap()
      const error = await response.error
      if (error) {
        const toolMessage = buildToolMessage({
          toolName: toolCall.name,
          toolId: toolCall.id,
          result: Result.error(error),
        })
        onFinish(toolMessage)
        return toolMessage
      }

      const resultToolCalls = await result.unwrap().toolCalls
      const [agentToolCalls, otherToolCalls] = resultToolCalls.reduce(
        (
          [agentToolCalls, otherToolCalls]: [ToolCall[], ToolCall[]],
          toolCall,
        ) => {
          if (toolCall.name === AGENT_RETURN_TOOL_NAME) {
            return [[...agentToolCalls, toolCall], otherToolCalls]
          } else {
            return [agentToolCalls, [...otherToolCalls, toolCall]]
          }
        },
        [[], []],
      )

      if (otherToolCalls.length) {
        throw new BadRequestError(
          `Agent tried to run client tools: '${otherToolCalls.map((tc) => tc.name).join("', '")}'`,
        )
      }

      if (agentToolCalls.length > 1) {
        throw new BadRequestError(`Agent returned more than one result`)
      }

      const agentToolCall = agentToolCalls[0]
      if (!agentToolCall) {
        throw new BadRequestError(`Agent did not return a result`)
      }

      const toolMessage = buildToolMessage({
        toolName: toolCall.name,
        toolId: toolCall.id,
        result: Result.ok(agentToolCall.arguments),
      })
      onFinish(toolMessage)
      return toolMessage
    } catch (error) {
      const toolMessage = buildToolMessage({
        toolName: toolCall.name,
        toolId: toolCall.id,
        result: Result.error(error as Error),
      })
      onFinish(toolMessage)
      return toolMessage
    }
  })
}
