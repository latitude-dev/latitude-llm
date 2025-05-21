import { ToolDefinition } from '@latitude-data/constants/ai'
import { OpenAIToolList } from '@latitude-data/constants/latitudePromptSchema'

export type ClientTool = {
  [key: string]: ToolDefinition
}
export type ToolInputMap = ClientTool & {
  openai?: OpenAIToolList
}
