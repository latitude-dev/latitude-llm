import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { LatitudeToolDefinition } from '../../../constants'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'
import { Result } from '../../../lib/Result'
import { memoryClient } from '../../memory'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { DocumentVersion } from '../../../browser'
import { MemoryOptions } from 'mem0ai'

export type StoreMemoryArgs = {
  messages: { role: 'user' | 'assistant'; content: string }[]
}

function storeMemory({
  userId,
  agentId,
}: {
  userId?: string
  agentId: string
}) {
  return async ({ messages }: StoreMemoryArgs, _toolCall?: any) => {
    if (!agentId) {
      return Result.error(new Error('Agent ID is not set. Contact support.'))
    }
    if (!userId) {
      return Result.error(new Error('User ID is not set'))
    }

    const client = memoryClient()
    const options: MemoryOptions = {}
    if (userId) {
      options.user_id = `${agentId}:${userId}`
    } else {
      options.agent_id = agentId
    }

    try {
      await client.add(messages, options)
    } catch (error) {
      return Result.error(error as Error)
    }

    return Result.ok({ done: 'true' })
  }
}

export default {
  name: LatitudeTool.StoreMemory,
  hidden: true,
  internalName: LatitudeToolInternalName.StoreMemory,
  definition: ({
    context,
    config,
    document,
  }: {
    context: TelemetryContext
    config: LatitudePromptConfig
    document: DocumentVersion
  }) => ({
    description:
      'Store conversation history and important information from your users',
    parameters: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
              },
              content: {
                type: 'string',
              },
            },
            required: ['role', 'content'],
            additionalProperties: false,
          },
        },
      },
      required: ['messages'],
      additionalProperties: false,
    },
    execute: async (args: StoreMemoryArgs, toolCall) =>
      withTelemetryWrapper(
        storeMemory({
          userId: (config.memory as { userId?: string })?.userId,
          agentId: document.documentUuid,
        }),
        {
          toolName: LatitudeTool.StoreMemory,
          context,
          args,
          toolCall,
        },
      ),
  }),
} as LatitudeToolDefinition
