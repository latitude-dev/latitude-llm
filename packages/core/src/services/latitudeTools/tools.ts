import { LatitudeToolDefinition } from './types'
import RunCodeTool from './runCode'
import WebSearchTool from './webSearch'
import WebExtractTool from './webExtract'

export const LATITUDE_TOOLS: LatitudeToolDefinition[] = [
  RunCodeTool,
  WebSearchTool,
  WebExtractTool,
] as const
