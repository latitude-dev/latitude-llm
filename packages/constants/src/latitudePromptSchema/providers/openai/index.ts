import { z } from 'zod'
import { FileSearchToolSchema } from './fileSearchToolSchema'
import { WebSearchToolSchema } from './webSearchSchema'

// OpenAI has another tool but's not supported yet by Vercel AI and nobody asked for it
// Info: https://platform.openai.com/docs/guides/tools-computer-use
export const openAIConfigSchema = z.object({
  endpoints: z
    .object({
      responses: z
        .object({
          tools: z
            .array(FileSearchToolSchema, WebSearchToolSchema)
            .optional()
            .nullable(),
        })
        .optional(),
    })
    .optional(),
})
