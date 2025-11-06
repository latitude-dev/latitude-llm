import type { Tool } from 'ai'
import {
  ChainStepObjectResponse,
  LogSources,
  ToolExecutionOptions,
  ToolManifest,
} from '@latitude-data/constants'
import { StreamManager } from '../../lib/streamManager'
import { getToolSimulationPrompt } from './getCopilotData'
import { runDocumentAtCommit } from '../commits'
import { BACKGROUND, telemetry } from '../../telemetry'

export function simulatedToolDefinition({
  streamManager,
  toolName,
  toolManifest,
}: {
  streamManager: StreamManager
  toolName: string
  toolManifest: ToolManifest
}): Tool {
  return {
    ...toolManifest.definition,
    execute: async (
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
            toolDescription: toolManifest.definition.description,
            toolInputSchema: toolManifest.definition.inputSchema,
            toolArgs: args,
            messages: toolCall.messages,
            prompt:
              streamManager.simulationSettings?.toolSimulationInstructions,
            toolOutputSchema: toolManifest.definition.outputSchema,
          },
        }).then((r) => r.unwrap())

        const responseResult = await response

        if (!responseResult) {
          const result = {
            isError: true,
            value: 'Error running simulation',
          }

          $tool?.end({ result })

          return result
        }

        const result = (
          responseResult as ChainStepObjectResponse<{
            isError: boolean
            value: object | string
          }>
        ).object

        $tool?.end({ result })
        return result
      } catch (_) {
        $tool?.fail(new Error('Unexpected simulation error'))

        return {
          isError: true,
          value: 'Unexpected simulation error',
        }
      }
    },
  }
}
