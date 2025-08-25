import type { ToolDefinition } from '@latitude-data/constants/ai'
import type { OpenAIToolList } from '@latitude-data/constants/latitudePromptSchema'

export type ClientTool = {
  [key: string]: ToolDefinition
}
export type ToolInputMap = ClientTool & {
  openai?: OpenAIToolList
}
