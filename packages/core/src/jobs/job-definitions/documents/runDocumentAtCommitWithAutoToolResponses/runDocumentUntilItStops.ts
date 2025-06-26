import { ToolCall } from '@latitude-data/compiler'
import { AGENT_RETURN_TOOL_NAME, LogSources } from '@latitude-data/constants'
import {
  Commit,
  DocumentVersion,
  Experiment,
  Workspace,
} from '../../../../browser'
import { runDocumentAtCommit } from '../../../../services/commits/runDocumentAtCommit'
import { telemetry, TelemetryContext } from '../../../../telemetry'
import { Result } from './../../../../lib/Result'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'
import { respondToToolCalls } from './respondToToolCalls'

type Props<T extends boolean> = T extends true
  ? {
      hasToolCalls: true
      autoRespondToolCalls: boolean
      data: {
        context: TelemetryContext
        workspace: Workspace
        commit: Commit
        document: DocumentVersion
        customPrompt?: string
        experiment?: Experiment
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
        context: TelemetryContext
        workspace: Workspace
        commit: Commit
        document: DocumentVersion
        customPrompt?: string
        experiment?: Experiment
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
    ? await runDocumentAtCommit(data)
    : await respondToToolCalls(data)

  if (runResult.error) return Result.error(runResult.error)
  const result = runResult.unwrap()

  const error = await result.error
  if (error) return Result.error(error)

  if (!autoRespondToolCalls) return Result.ok(result)

  const toolCalls = await result.toolCalls
  const clientToolCalls = toolCalls.filter(
    (toolCall) => toolCall.name !== AGENT_RETURN_TOOL_NAME,
  )
  const trace = await result.trace

  // Note: resume trace to continue it syncronously
  const context = telemetry.resume(trace)

  if (clientToolCalls.length) {
    return recursiveFn(
      {
        hasToolCalls: true,
        autoRespondToolCalls,
        data: {
          ...data,
          context: context,
          documentLogUuid: result.errorableUuid,
          toolCalls: clientToolCalls,
        },
      },
      recursiveFn,
    )
  }

  return Result.ok(result)
}
