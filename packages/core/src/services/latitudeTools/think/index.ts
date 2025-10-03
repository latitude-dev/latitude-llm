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
import z from 'zod'

async function think(): PromisedResult<unknown, LatitudeError> {
  return Result.ok({})
}

export default {
  name: LatitudeTool.Think,
  internalName: LatitudeToolInternalName.Think,
  method: think,
  definition: (context?: TelemetryContext) => ({
    description:
      'Allows you to explicitly understand, plan, and reflect on actions.',
    inputSchema: z.object({
      action: z
        .enum(['understand', 'plan', 'reflect'])
        .describe(
          'The type of thought process ("understand", "plan", or "reflect").',
        ),
      thought: z.string().describe('The content of the thought.'),
    }),
    execute: async (args, toolCall) =>
      withTelemetryWrapper(think, {
        toolName: LatitudeTool.Think,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition
