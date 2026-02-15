import { Tool } from 'ai'
import { LatitudeError } from '../../../../lib/errors'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import { ToolManifest } from '@latitude-data/constants/tools'
import { findIntegrationById } from '../../../../queries/integrations/findById'
import { callIntegrationTool } from '../../../../services/integrations/McpClient/callTool'
import { StreamManager } from '../../../../lib/streamManager'
import { telemetry } from '../../../../telemetry'
import { publisher } from '../../../../events/publisher'
import { ToolSource } from '@latitude-data/constants/toolSources'

export async function resolveIntegrationToolDefinition({
  toolName,
  toolManifest,
  streamManager,
}: {
  toolName: string
  toolManifest: ToolManifest<ToolSource.Integration>
  streamManager: StreamManager
}): PromisedResult<Tool, LatitudeError> {
  let integration
  try {
    integration = await findIntegrationById({
      workspaceId: streamManager.workspace.id,
      id: toolManifest.sourceData.integrationId,
    })
  } catch (e) {
    return Result.error(e as LatitudeError)
  }

  return Result.ok({
    ...toolManifest.definition,
    execute: async (args, toolCall) => {
      const $tool = telemetry.span.tool(
        {
          name: toolName,
          call: {
            id: toolCall.toolCallId,
            arguments: args,
          },
        },
        streamManager.$context,
      )

      publisher.publishLater({
        type: 'toolExecuted',
        data: {
          workspaceId: streamManager.workspace.id,
          type: 'integration',
          toolName,
          integration: {
            id: integration.id,
            name: integration.name,
            type: integration.type,
          },
        },
      })

      try {
        const value = await callIntegrationTool({
          integration,
          toolName: toolManifest.sourceData.toolName,
          args,
          streamManager,
        }).then((r) => r.unwrap())

        $tool?.end({ result: { value, isError: false } })

        return {
          value,
          isError: false,
        }
      } catch (err) {
        const result = {
          value: (err as Error).message,
          isError: true,
        }

        $tool?.end({ result })

        return result
      }
    },
  })
}
