import { JSONSchema7 } from 'json-schema'

export type McpTool = {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties: Record<string, JSONSchema7>
  }
}
