import { LatitudeToolDefinition } from '../../constants'
import RunCodeTool from './runCode'
import WebExtractTool from './webExtract'
import WebSearchTool from './webSearch'

export const LATITUDE_TOOLS: LatitudeToolDefinition[] = [
  RunCodeTool,
  WebSearchTool,
  WebExtractTool,
] as const
