import { LogSources, ToolExecutionOptions } from '@latitude-data/constants'
import { BadRequestError, LatitudeError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import { ToolManifest } from '@latitude-data/constants/tools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { StreamManager } from '../../../../lib/streamManager'
import { telemetry, TelemetryContext } from '../../../../telemetry'
import { Tool } from 'ai'
import { awaitClientToolResult, ToolHandler } from '../clientTools/handlers'
import { publisher } from '../../../../events/publisher'

/**
 * Instruments a tool handler execution with OTL telemetry and decorates the
 * tool handler call with some extra parameters (e.g context and toolDefinition)
 */
function instrumentToolHandler(
  toolHandler: ToolHandler,
  {
    workspaceId,
    context,
    toolName,
    toolManifest,
  }: {
    workspaceId: number
    context: TelemetryContext
    toolName: string
    toolManifest: ToolManifest<ToolSource.Client>
  },
) {
  return async (
    args: Record<string, unknown>,
    toolCall: ToolExecutionOptions,
  ) => {
    const $tool = telemetry.span.tool(
      {
        name: toolName,
        call: {
          id: toolCall.toolCallId,
          arguments: args,
        },
      },
      context,
    )

    publisher.publishLater({
      type: 'toolExecuted',
      data: {
        workspaceId,
        type: 'client',
        toolName,
      },
    })

    try {
      const result = await toolHandler({
        context: $tool.context,
        toolManifest,
        toolCall,
        args,
      })

      $tool?.end({ result: { isError: false, value: result } })
      return result
    } catch (error) {
      $tool?.fail(error as Error)
      throw error
    }
  }
}

export function resolveClientToolDefinition({
  toolName,
  toolManifest,
  streamManager,
}: {
  toolName: string
  toolManifest: ToolManifest<ToolSource.Client>
  streamManager: StreamManager
}): TypedResult<Tool, LatitudeError> {
  if (streamManager.source === LogSources.Playground) {
    return Result.ok({
      ...toolManifest.definition,
      execute: instrumentToolHandler(awaitClientToolResult, {
        workspaceId: streamManager.workspace.id,
        context: streamManager.$context,
        toolManifest,
        toolName,
      }),
    })
  }

  const toolHandler = streamManager.tools[toolName]
  if (toolHandler) {
    return Result.ok({
      ...toolManifest.definition,
      execute: instrumentToolHandler(toolHandler, {
        workspaceId: streamManager.workspace.id,
        context: streamManager.$context,
        toolName,
        toolManifest,
      }),
    })
  }

  return Result.error(
    new BadRequestError(`Tool handler not found for client tool '${toolName}'`),
  )
}
