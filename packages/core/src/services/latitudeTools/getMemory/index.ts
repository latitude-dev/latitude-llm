import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { LatitudeToolDefinition } from '../../../constants'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'
import { Result } from '../../../lib/Result'
import { memoryClient } from '../../memory'
import { SearchOptions } from 'mem0ai'

export type GetMemoryArgs = {
  query: string
  filters: Pick<SearchOptions, 'user_id' | 'run_id'>
}

async function getMemory({ query, filters }: GetMemoryArgs) {
  const client = memoryClient()

  try {
    const result = await client.search(query, filters)

    return Result.ok(result)
  } catch (error) {
    return Result.error(error as Error)
  }
}

export default {
  name: LatitudeTool.GetMemory,
  internalName: LatitudeToolInternalName.GetMemory,
  method: getMemory,
  definition: (context: TelemetryContext) => ({
    description: 'Retrieve the complete memory history for a specific user',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
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
      required: ['query', 'filters'],
      additionalProperties: false,
    },
    execute: async (args: GetMemoryArgs, toolCall) =>
      withTelemetryWrapper(getMemory, {
        toolName: LatitudeTool.GetMemory,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition
