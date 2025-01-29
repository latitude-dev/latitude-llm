import { ToolCall } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'

export enum LatitudeBuiltInToolName {
  RunCode = 'lat_run_code',
}

export type ToolDefinition = {
  description: string
  parameters: JSONSchema7
}

export type BuiltInToolCall = ToolCall & {
  name: LatitudeBuiltInToolName
}

export const LATITUDE_BUILT_IN_TOOLS_DEFINITION: Record<
  LatitudeBuiltInToolName,
  ToolDefinition
> = {
  [LatitudeBuiltInToolName.RunCode]: {
    description:
      'Runs a custom script, and returns the output text. In order to obtain results, the code must include an output statement (e.g. print in Python, console.log in JavaScript).',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python', 'javascript'],
          description:
            'The language of the script. Either "python" or "javascript" (node).',
        },
        code: {
          type: 'string',
          description: 'The code to run.',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'An optional list of all the required dependencies to run the script. Adding dependencies will severely increate the execution time, so do not include them unless required.',
        },
      },
      required: ['language', 'code'],
    },
  },
}
