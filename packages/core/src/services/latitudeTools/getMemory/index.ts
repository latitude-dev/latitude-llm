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

export type GetMemoryArgs = {
  query: string
}

function getMemory({ userId, agentId }: { userId?: string; agentId: string }) {
  return async ({ query }: GetMemoryArgs) => {
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
      const result = await client.search(query, options)

      return Result.ok(
        result.map((m) => ({ memory: m.memory, score: m.score })),
      )
    } catch (error) {
      return Result.error(error as Error)
    }
  }
}

export default {
  name: LatitudeTool.GetMemory,
  hidden: true,
  internalName: LatitudeToolInternalName.GetMemory,
  definition: ({
    context,
    config,
    document,
  }: {
    context: TelemetryContext
    config: LatitudePromptConfig
    document: DocumentVersion
  }) => ({
    description: 'Retrieve the complete memory history for a specific user',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (args: GetMemoryArgs, toolCall) =>
      withTelemetryWrapper(
        getMemory({
          userId: (config.memory as { userId?: string })?.userId,
          agentId: document.documentUuid,
        }),
        {
          toolName: LatitudeTool.GetMemory,
          context,
          args,
          toolCall,
        },
      ),
  }),
} as LatitudeToolDefinition
