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

async function getToday(): PromisedResult<string, LatitudeError> {
  const today = new Date().toISOString()
  return Result.ok(today)
}

export default {
  name: LatitudeTool.Today,
  internalName: LatitudeToolInternalName.Today,
  method: getToday,
  definition: (context: TelemetryContext) => ({
    description:
      'Returns the current date and time in UTC timezone and ISO format (YYYY-MM-DDTHH:mm:ss.sssZ).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    execute: async (args: Record<string, never>, toolCall) =>
      withTelemetryWrapper(getToday, {
        toolName: LatitudeTool.Today,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition
