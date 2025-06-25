import { ToolDefinition } from '@latitude-data/constants'
import { ChainError, LatitudeError, RunErrorCodes } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools, ToolSource } from './types'
import {
  AI_PROVIDERS_WITH_BUILTIN_TOOLS,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'
import { publisher } from '../../../events/publisher'
import { ToolCallPart } from 'ai'

const TIMEOUT_CLIENT_TOOL_CALL = 5 * 60 * 1000 // 5 minutes

type ToolTuple = [string, ToolDefinition]

function filterProviderTools([name]: ToolTuple) {
  return !AI_PROVIDERS_WITH_BUILTIN_TOOLS.includes(name)
}

function mockClientToolResponse(_: ToolCallPart) {
  // TODO(compiler): implement copilot mocking
  return 'wat'
}

function buildDefinition(mockClientToolResults: boolean = false) {
  return ([name, definition]: ToolTuple) => {
    return [
      name,
      {
        definition: {
          ...definition,
          execute: async (_: any, toolCall: ToolCallPart) => {
            if (mockClientToolResults) return mockClientToolResponse(toolCall)
            return new Promise((resolve, reject) => {
              // Create listener
              const listener = ({
                toolCallId,
                result,
              }: {
                toolCallId: string
                result: unknown
              }) => {
                if (toolCall.toolCallId !== toolCallId) return

                resolve(result)
              }

              // Subscribe to event
              publisher.subscribe('clientToolResultReceived', listener)

              // Unsubscribe after timeout
              setTimeout(() => {
                publisher.unsubscribe('clientToolResultReceived', listener)

                reject(
                  new ChainError({
                    code: RunErrorCodes.AIRunError,
                    message:
                      'Timeout waiting for client to respond to a tool call',
                  }),
                )
              }, TIMEOUT_CLIENT_TOOL_CALL) // 5 minutes
            })
          },
        },
        sourceData: { source: ToolSource.Client },
      },
    ]
  }
}

export function resolveClientTools({
  config,
  mockClientToolResults = false,
}: {
  config: LatitudePromptConfig
  mockClientToolResults?: boolean
}): TypedResult<ResolvedTools, LatitudeError> {
  const tools = config.tools as
    | ToolDefinition[]
    | Record<string, ToolDefinition>
  if (!tools) return Result.ok({})

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    return oldSchemaToolDeclarations({ tools, mockClientToolResults })
  }

  return newSchemaToolDeclarations({ tools, mockClientToolResults })
}

function oldSchemaToolDeclarations({
  tools,
  mockClientToolResults,
}: {
  tools: Record<string, ToolDefinition>
  mockClientToolResults: boolean
}): TypedResult<ResolvedTools, LatitudeError> {
  return Result.ok(
    Object.fromEntries(
      Object.entries(tools)
        .filter(filterProviderTools)
        .map(buildDefinition(mockClientToolResults)),
    ),
  )
}

function newSchemaToolDeclarations({
  tools,
  mockClientToolResults,
}: {
  tools: ToolDefinition[]
  mockClientToolResults: boolean
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
        .map(buildDefinition(mockClientToolResults)),
    ),
  )
}
