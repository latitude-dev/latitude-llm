import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { LatitudeToolDefinition } from '../../../constants'
import { LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'

async function think(): PromisedResult<unknown, LatitudeError> {
  return Result.ok({})
}

export default {
  name: LatitudeTool.Think,
  internalName: LatitudeToolInternalName.Think,
  method: think,
  definition: (context: TelemetryContext) => ({
    description:
      'Allows you to explicitly understand, plan, and reflect on actions.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['understand', 'plan', 'reflect'],
          description:
            'The type of thought process ("understand", "plan", or "reflect").',
        },
        thought: {
          type: 'string',
          description: 'The content of the thought.',
        },
      },
      required: ['action', 'thought'],
      additionalProperties: false,
    },
    execute: async (args, toolCall) =>
      withTelemetryWrapper(think, {
        toolName: LatitudeTool.Think,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition

