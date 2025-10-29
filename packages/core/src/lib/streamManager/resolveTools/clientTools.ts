import {
  LogSources,
  ToolDefinition,
  ToolExecutionOptions,
} from '@latitude-data/constants'
import { LatitudeError } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools } from './types'
import { ToolSource } from '@latitude-data/constants/toolSources'
import {
  AI_PROVIDERS_WITH_BUILTIN_TOOLS,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'
import { StreamManager } from '..'
import { telemetry, TelemetryContext } from '../../../telemetry'
import { Tool } from 'ai'
import { awaitClientToolResult, ToolHandler } from '../clientTools/handlers'
import { publisher } from '../../../events/publisher'
import { simulatedToolDefinition } from '../../../services/simulation/simulateToolResponse'

type ToolTuple = [string, ToolDefinition]

export function resolveClientTools({
  config,
  streamManager,
}: {
  config: LatitudePromptConfig
  streamManager: StreamManager
}): TypedResult<ResolvedTools, LatitudeError> {
  const tools = config.tools as
    | ToolDefinition[]
    | Record<string, ToolDefinition>
  if (!tools) return Result.ok({})

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (isOldToolsSchema(tools)) {
    return oldSchemaToolDeclarations({
      tools: tools as Record<string, ToolDefinition>,
      streamManager,
    })
  }

  return newSchemaToolDeclarations({
    tools: tools as ToolDefinition[],
    streamManager,
  })
}

function oldSchemaToolDeclarations({
  tools,
  streamManager,
}: {
  tools: Record<string, ToolDefinition>
  streamManager: StreamManager
}): TypedResult<ResolvedTools, LatitudeError> {
  return Result.ok(
    Object.fromEntries(
      Object.entries(tools)
        .filter(filterProviderTools)
        .map(buildDefinition(streamManager)),
    ),
  )
}

export function isOldToolsSchema(
  tools: Record<string, ToolDefinition> | Array<ToolDefinition>,
) {
  return typeof tools === 'object' && !Array.isArray(tools) && tools !== null
}

function newSchemaToolDeclarations({
  tools,
  streamManager,
}: {
  tools: ToolDefinition[]
  streamManager: StreamManager
}): TypedResult<ResolvedTools, LatitudeError> {
  // Filter Latitude tools that are strings
  const clientToolDefinitions: Record<string, ToolDefinition> = Object.assign(
    {},
    ...tools.filter((t) => typeof t !== 'string'),
  )

  return Result.ok(
    Object.fromEntries(
      Object.entries(clientToolDefinitions)
        .filter(filterProviderTools)
        .map(buildDefinition(streamManager)),
    ),
  )
}

function filterProviderTools([name]: ToolTuple) {
  return !AI_PROVIDERS_WITH_BUILTIN_TOOLS.includes(name)
}

/**
 * Vercel AI SDK changed `parameters` by `inputSchema` in their Tool
 * definition. We want to ignore this difference here
 * and get the rest of the Vercel Tool
 */
type AdaptedVercelToolDefinition = Omit<Tool, 'inputSchema'> & {
  parameters: ToolDefinition['parameters']
}
/**
 * Builds a tool definition. if the tool has a defined handler in the stream
 * manager, it will be added to the definition so that it's automatically
 * executed by vercel AI sdk downstream.
 */
function buildDefinition(streamManager: StreamManager) {
  return ([name, toolDefinition]: ToolTuple) => {
    const definition = toolDefinition as AdaptedVercelToolDefinition

    if (streamManager.simulationSettings?.simulateToolResponses) {
      definition.execute = simulatedToolDefinition({
        streamManager,
        toolName: name,
        toolDescription: definition.description ?? '',
        inputSchema: definition.parameters,
      })
    } else if (streamManager.source === LogSources.Playground) {
      definition.execute = instrumentToolHandler(awaitClientToolResult, {
        workspaceId: streamManager.workspace.id,
        context: streamManager.$completion!.context,
        toolDefinition,
        toolName: name,
      })
    } else {
      const toolHandler = streamManager.tools[name]
      if (toolHandler) {
        definition.execute = instrumentToolHandler(toolHandler, {
          workspaceId: streamManager.workspace.id,
          context: streamManager.$completion!.context,
          toolDefinition,
          toolName: name,
        })
      }
    }

    return [
      name,
      {
        definition,
        sourceData: {
          source: ToolSource.Client,
          simulated: streamManager.simulationSettings?.simulateToolResponses,
        },
      },
    ]
  }
}

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
    toolDefinition,
  }: {
    workspaceId: number
    context: TelemetryContext
    toolName: string
    toolDefinition: ToolDefinition
  },
) {
  return async (
    args: Record<string, unknown>,
    toolCall: ToolExecutionOptions,
  ) => {
    const $tool = telemetry.tool(context, {
      name: toolName,
      call: {
        id: toolCall.toolCallId,
        arguments: args,
      },
    })

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
        toolDefinition,
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
