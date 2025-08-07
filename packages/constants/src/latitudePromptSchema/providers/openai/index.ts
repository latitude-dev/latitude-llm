import { z } from 'zod'
import { ComputerCallSchema } from './computerCallSchema'
import { FileSearchToolSchema } from './fileSearchToolSchema'
import { WebSearchToolSchema } from './webSearchSchema'

// OpenAI has another tool but's not supported yet by Vercel AI and nobody asked for it
// Info: https://platform.openai.com/docs/guides/tools-computer-use
export const openAIToolsList = z.array(
  z.union([WebSearchToolSchema, FileSearchToolSchema, ComputerCallSchema]),
)

export type OpenAIToolList = z.infer<typeof openAIToolsList>

export { ComputerCallSchema } from './computerCallSchema'
export {
  FileSearchToolSchema,
  type OpenAIFilesSearchTool,
} from './fileSearchToolSchema'
export {
  WebSearchToolSchema,
  type OpenAIWebSearchTool,
} from './webSearchSchema'
