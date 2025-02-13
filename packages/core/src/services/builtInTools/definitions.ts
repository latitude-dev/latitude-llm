import { ToolCall } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'

export enum LatitudeTool {
  RunCode = 'code',
}

export enum LatitudeToolInternalName {
  RunCode = 'lat_run_code',
}

export type ToolDefinition = {
  description: string
  parameters: JSONSchema7
}

export type BuiltInToolCall = ToolCall & {
  name: LatitudeToolInternalName
}

export const getLatitudeToolInternalName = (
  tool: LatitudeTool,
): LatitudeToolInternalName => {
  const toolKey = Object.entries(LatitudeTool).find(
    ([_, val]) => val === tool,
  )?.[0]!
  return LatitudeToolInternalName[
    toolKey as keyof typeof LatitudeToolInternalName
  ]
}

export const getLatitudeToolName = (
  internalName: LatitudeToolInternalName,
): LatitudeTool => {
  const toolKey = Object.entries(LatitudeToolInternalName).find(
    ([_, val]) => val === internalName,
  )?.[0]!
  return LatitudeTool[toolKey as keyof typeof LatitudeTool]
}

export const LATITUDE_TOOLS_DEFINITION: Record<LatitudeTool, ToolDefinition> = {
  [LatitudeTool.RunCode]: {
    description:
      'Runs a custom script, and returns the output text.\n' +
      'This code will be executed in a sandboxed environment, so it cannot have access to other or previous runs.\n' +
      'In order to obtain results, the code must include an output statement (e.g. `print(…)` in Python, `console.log(…)` in JavaScript).\n' +
      'The executed code will be timed out after 60 seconds. This means that the code must finish execution within 60 seconds, or it will be stopped, which makes it not suitable for long-running scripts or server-side code.\n' +
      'No environment variables are available: All necessary configurations must be provided in the code itself.',
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
            'An optional list of all the required dependencies to run the script. Adding dependencies will severely increase the execution time, so do not include them unless required.',
        },
      },
      required: ['language', 'code'],
    },
  },
}
