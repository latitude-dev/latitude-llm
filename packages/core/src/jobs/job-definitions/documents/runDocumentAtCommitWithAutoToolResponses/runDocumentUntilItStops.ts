import { LogSources } from '@latitude-data/constants'
import { runDocumentAtCommit as runDocumentAtCommitFn } from '../../../../services/commits/runDocumentAtCommit'
import { Commit, Workspace, DocumentVersion } from '../../../../browser'
import { ToolCall } from '@latitude-data/compiler'
import { Result } from '../../../../lib'
import { respondToToolCalls } from './respondToToolCalls'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'

type Props<T extends boolean> = T extends true
  ? {
      hasToolCalls: true
      autoRespondToolCalls: boolean
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
      autoRespondToolCalls: boolean
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
  { hasToolCalls, autoRespondToolCalls, data }: Props<T>,
  recursiveFn: typeof runDocumentUntilItStops,
) {
  const runResult = !hasToolCalls
    ? await runDocumentAtCommitFn(data)
    : await respondToToolCalls(data)

  if (runResult.error) return Result.error(runResult.error)
  const result = runResult.unwrap()

  const error = await result.error
  if (error) {
    return Result.error(error)
  }

  if (!autoRespondToolCalls) {
    return Result.ok(result)
  }

  const toolCalls = await result.toolCalls

  if (toolCalls.length) {
    return recursiveFn(
      {
        hasToolCalls: true,
        autoRespondToolCalls,
        data: {
          ...data,
          documentLogUuid: result.errorableUuid,
          toolCalls,
        },
      },
      recursiveFn,
    )
  }

  return Result.ok(result)
}
