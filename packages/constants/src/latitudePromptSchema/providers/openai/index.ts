import { z } from 'zod'
import { FileSearchToolSchema } from './fileSearchToolSchema'
import { WebSearchToolSchema } from './webSearchSchema'
import { ComputerCallSchema } from './computerCallSchema'

// OpenAI has another tool but's not supported yet by Vercel AI and nobody asked for it
// Info: https://platform.openai.com/docs/guides/tools-computer-use
export const openAIToolSchema = z.union([
  WebSearchToolSchema,
  FileSearchToolSchema,
  ComputerCallSchema,
])
export type OpenAITool = z.infer<typeof openAIToolSchema>

export const openAIToolsListSchema = z.array(openAIToolSchema)
export type OpenAIToolList = z.infer<typeof openAIToolsListSchema>

export {
  type OpenAIWebSearchTool,
  WebSearchToolSchema,
} from './webSearchSchema'
export {
  type OpenAIFilesSearchTool,
  FileSearchToolSchema,
} from './fileSearchToolSchema'
export { ComputerCallSchema } from './computerCallSchema'
