import type { ToolCall } from '@latitude-data/compiler'
import { AGENT_RETURN_TOOL_NAME, LogSources } from '@latitude-data/constants'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { runDocumentAtCommitLegacy } from '../../../../../services/__deprecated/commits/runDocumentAtCommit'
import { BadRequestError, NotFoundError } from '../../../../../lib/errors'
import { Result } from '../../../../../lib/Result'
import type { PromisedResult } from '../../../../../lib/Transaction'
import { ToolSource } from '../../resolveTools/types'
import type { ToolResponsesArgs } from './types'

export function getAgentsAsToolCallsResults({
  workspace,
  promptSource,
  toolCalls,
  resolvedTools,
}: ToolResponsesArgs): PromisedResult<unknown>[] {
  if (!('commit' in promptSource)) {
    return toolCalls.map(async () =>
      Result.error(new BadRequestError(`Agents cannot be run in this context`)),
    )
  }

  const docsScope = new DocumentVersionsRepository(workspace.id)
  const promisedAllDocsResult = docsScope.getDocumentsAtCommit(promptSource.commit)

  return toolCalls.map(async (toolCall) => {
    const allDocsResult = await promisedAllDocsResult
    if (allDocsResult.error) return allDocsResult
    const allDocs = allDocsResult.unwrap()

    const resolvedTool = resolvedTools[toolCall.name]!
    if (resolvedTool.sourceData.source !== ToolSource.AgentAsTool) {
      return Result.error(new NotFoundError(`Unknown tool`))
    }

    const agentPath = resolvedTool.sourceData.agentPath
    const document = allDocs.find((doc) => doc.path === agentPath)
    if (!document) {
      return Result.error(new NotFoundError(`Agent '${agentPath}' not found`))
    }

    const result = await runDocumentAtCommitLegacy({
      workspace,
      document,
      commit: promptSource.commit,
      parameters: toolCall.arguments,
      source: LogSources.AgentAsTool,
    })
    if (result.error) return result

    const response = result.unwrap()
    const error = await response.error
    if (error) return Result.error(error)

    const resultToolCalls = await result.unwrap().toolCalls
    const [agentToolCalls, otherToolCalls] = resultToolCalls.reduce(
      ([agentToolCalls, otherToolCalls]: [ToolCall[], ToolCall[]], toolCall) => {
        if (toolCall.name === AGENT_RETURN_TOOL_NAME) {
          return [[...agentToolCalls, toolCall], otherToolCalls]
        } else {
          return [agentToolCalls, [...otherToolCalls, toolCall]]
        }
      },
      [[], []],
    )

    if (otherToolCalls.length) {
      return Result.error(
        new BadRequestError(
          `Agent tried to run client tools: '${otherToolCalls.map((tc) => tc.name).join("', '")}'`,
        ),
      )
    }

    const agentToolCall = agentToolCalls[0]
    if (!agentToolCall) {
      return Result.error(new BadRequestError(`Agent did not return a result`))
    }

    return Result.ok(agentToolCall.arguments)
  })
}
