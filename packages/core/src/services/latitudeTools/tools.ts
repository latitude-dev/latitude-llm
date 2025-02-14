import RunCodeTool from './runCode'
import WebSearchTool from './webSearch'
import { LatitudeToolDefinition } from './types'

export const LATITUDE_TOOLS: LatitudeToolDefinition[] = [
  RunCodeTool,
  WebSearchTool,
] as const
