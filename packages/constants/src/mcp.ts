import { JSONSchema7 } from 'json-schema'

export type McpTool = {
  name: string
  displayName?: string
  description?: string
  inputSchema: {
    type: 'object'
    properties: Record<string, JSONSchema7>
    additionalProperties: boolean
  }
}
