import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { LatitudeToolDefinition } from '../../../constants'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'
import { Result } from '../../../lib/Result'
import { memoryClient } from '../../memory'
import { MemoryOptions } from 'mem0ai'

export type StoreMemoryArgs = {
  messages: { role: 'user' | 'assistant'; content: string }[]
  filters: Pick<MemoryOptions, 'user_id' | 'run_id'>
}

async function storeMemory({ messages, filters }: StoreMemoryArgs) {
  const client = memoryClient()

  try {
    await client.add(messages, filters)
  } catch (error) {
    return Result.error(error as Error)
  }

  return Result.ok({ done: 'true' })
}

export default {
  name: LatitudeTool.StoreMemory,
  internalName: LatitudeToolInternalName.StoreMemory,
  method: storeMemory,
  definition: (context: TelemetryContext) => ({
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
        filters: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
            },
            run_id: {
              type: 'string',
            },
          },
          required: ['user_id'],
        },
      },
      required: ['messages', 'filters'],
      additionalProperties: false,
    },
    execute: async (args: StoreMemoryArgs, toolCall) =>
      withTelemetryWrapper(storeMemory, {
        toolName: LatitudeTool.StoreMemory,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition
