import { LogSources, StreamType } from '@latitude-data/constants'
import { runDocumentAtCommit as runDocumentAtCommitFn } from '../../../../services/commits/runDocumentAtCommit'
import { Commit, Workspace, DocumentVersion } from '../../../../browser'
import { ChainResponse } from '../../../../services/chains/run'
import { ToolCall } from '@latitude-data/compiler'
import { getToolCalls } from '../../../../services/chains/runStep'
import { Result } from '../../../../lib'
import { respondToToolCalls } from './respondToToolCalls'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'

async function getResponseValue(response: Promise<ChainResponse<StreamType>>) {
  const responseResult = await response
  if (responseResult.error) return responseResult

  return Result.ok(responseResult.value)
}

type Props<T extends boolean> = T extends true
  ? {
      hasToolCalls: true
      data: {
        workspace: Workspace
        commit: Commit
        document: DocumentVersion
        documentLogUuid: string
        copilot: AutogenerateToolResponseCopilotData
        source: LogSources
        toolCalls: ToolCall[]
      }
    }
  : {
      hasToolCalls: false
      data: {
        workspace: Workspace
        document: DocumentVersion
        commit: Commit
        copilot: AutogenerateToolResponseCopilotData
        parameters: Record<string, unknown>
        source: LogSources
      }
    }

/**
 * Run a document until it stops. When a document is run it can happen 2 things:
 *
 * (A) The prompt is compiled and the response is generated
 * (B) The response is generated and it contains tool calls
 *
 * When (B) this function run recursively until the response is generated
 */
export async function runDocumentUntilItStops<T extends boolean>(
  { hasToolCalls, data }: Props<T>,
  recursiveFn: typeof runDocumentUntilItStops,
) {
  const result = !hasToolCalls
    ? await runDocumentAtCommitFn(data)
    : await respondToToolCalls(data)

  if (result.error) return result

  const value = result.value
  const responseResult = await getResponseValue(value.response)
  if (responseResult.error) return result

  const response = responseResult.value
  const toolCalls = getToolCalls({ response })
  if (!toolCalls.length) return result

  return recursiveFn(
    {
      hasToolCalls: true,
      data: {
        workspace: data.workspace,
        commit: data.commit,
        document: data.document,
        source: data.source,
        copilot: data.copilot,
        documentLogUuid: value.errorableUuid,
        toolCalls,
      },
    },
    recursiveFn,
  )
}
