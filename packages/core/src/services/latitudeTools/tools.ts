import RunCodeTool from './runCode'
import WebSearchTool from './webSearch'
import WebExtractTool from './webExtract'
import StoreMemoryTool from './storeMemory'
import GetMemoryTool from './getMemory'
import { LatitudeToolDefinition } from '../../constants'

export const LATITUDE_TOOLS: LatitudeToolDefinition[] = [
  WebSearchTool,
  WebExtractTool,
  RunCodeTool,
  StoreMemoryTool,
  GetMemoryTool,
] as const
