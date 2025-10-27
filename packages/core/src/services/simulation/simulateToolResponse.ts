import type { JSONSchema7, Tool } from 'ai'
import {
  ChainStepObjectResponse,
  LogSources,
  ToolExecutionOptions,
} from '@latitude-data/constants'
import { StreamManager } from '../../lib/streamManager'
import { getToolSimulationPrompt } from './getCopilotData'
import { runDocumentAtCommit } from '../commits'
import { BACKGROUND, telemetry } from '../../telemetry'

export function simulatedToolDefinition({
  streamManager,
  toolName,
  toolDescription,
  inputSchema,
  outputSchema,
}: {
  streamManager: StreamManager
  toolName: string
  toolDescription: string
  inputSchema: JSONSchema7
  outputSchema?: JSONSchema7
}): Tool['execute'] {
  return async (
    args: Record<string, unknown>,
    toolCall: ToolExecutionOptions,
  ) => {
    const $tool = telemetry.tool(streamManager.$completion!.context, {
      name: toolName,
      call: {
        id: toolCall.toolCallId,
        arguments: args,
      },
    })

    try {
      const simulationPrompt = await getToolSimulationPrompt().then((r) =>
        r.unwrap(),
      )

      const { response } = await runDocumentAtCommit({
        context: BACKGROUND({ workspaceId: simulationPrompt.workspace.id }),
        commit: simulationPrompt.commit,
        document: simulationPrompt.document,
        workspace: simulationPrompt.workspace,
        source: LogSources.Copilot,
        parameters: {
          toolName,
          toolDescription,
          toolInputSchema: inputSchema,
          toolArgs: args,
          messages: toolCall.messages,
          prompt: streamManager.simulationSettings?.toolSimulationInstructions,
          toolOutputSchema: outputSchema,
        },
      }).then((r) => r.unwrap())

      const res = await response

      if (!res) {
        $tool?.end({
          result: { isError: true, value: 'No response from simulation' },
        })

        return {
          isError: true,
          value: 'No response from simulation',
        }
      }

      const { isError, value } = (
        res as ChainStepObjectResponse<{
          isError: boolean
          value: object | string
        }>
      ).object

      $tool?.end({ result: { isError, value } })

      return {
        isError,
        value,
      }
    } catch (_) {
      $tool?.fail(new Error('Unexpected simulation error'))

      return {
        isError: true,
        value: 'Unexpected simulation error',
      }
    }
  }
}
