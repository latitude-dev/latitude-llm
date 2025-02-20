import RunCodeTool from './runCode'
import WebSearchTool from './webSearch'
import WebExtractTool from './webExtract'
import { LatitudeToolDefinition } from '../../constants'

export const LATITUDE_TOOLS: LatitudeToolDefinition[] = [
  RunCodeTool,
  WebSearchTool,
  WebExtractTool,
] as const
