import RunCodeTool from './runCode'
import WebSearchTool from './webSearch'
import WebExtractTool from './webExtract'
import ThinkTool from './think'
import TodoTool from './todo'
import { LatitudeToolDefinition } from '../../constants'

export const LATITUDE_TOOLS: LatitudeToolDefinition[] = [
  WebSearchTool,
  WebExtractTool,
  RunCodeTool,
  ThinkTool,
  TodoTool,
] as const
