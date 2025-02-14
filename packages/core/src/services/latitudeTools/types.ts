import { ToolCall } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'
import { LatitudeError, PromisedResult } from '../../lib'

export enum LatitudeTool {
  RunCode = 'code',
  WebSearch = 'search',
  WebExtract = 'extract',
}

export enum LatitudeToolInternalName {
  RunCode = 'lat_run_code',
  WebSearch = 'lat_web_search',
  WebExtract = 'lat_web_extract',
}

export type ToolDefinition = {
  description: string
  parameters: JSONSchema7
}

export type LatitudeToolDefinition = {
  name: LatitudeTool
  internalName: LatitudeToolInternalName
  definition: ToolDefinition
  method: (args: unknown) => PromisedResult<unknown, LatitudeError>
}

export type LatitudeToolCall = ToolCall & {
  name: LatitudeToolInternalName
}
