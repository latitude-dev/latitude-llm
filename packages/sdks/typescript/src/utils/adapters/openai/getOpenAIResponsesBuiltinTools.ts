import { ClientTool, ToolInputMap } from '$sdk/utils/adapters/types'
import {
  ComputerCallSchema,
  FileSearchToolSchema,
  OpenAIToolList,
  WebSearchToolSchema,
} from '@latitude-data/constants/latitudePromptSchema'

export function getOpenAIResponsesBuiltinTools({
  tools,
}: {
  tools: ToolInputMap
}) {
  return Object.entries(tools).reduce(
    (acc, [name, definition]) => {
      if (name === 'openai') {
        // Under openai key in tools only can be an array of builtin tools
        if (!Array.isArray(definition)) return acc

        const builtinTools = definition.map((tool) => {
          const type = tool.type
          switch (type) {
            case 'web_search_preview':
            case 'web_search_preview_2025_03_11': {
              const result = WebSearchToolSchema.safeParse(tool)
              if (result.error) {
                throw new Error(result.error.message)
              }
              return result.data
            }
            case 'file_search': {
              const result = FileSearchToolSchema.safeParse(tool)
              if (result.error) {
                throw new Error(result.error.message)
              }
              return result.data
            }
            case 'computer_use_preview': {
              const result = ComputerCallSchema.safeParse(tool)
              if (result.error) {
                throw new Error(result.error.message)
              }
              return result.data
            }
            default: {
              throw new Error(`Unknown OpenAI tool type: ${type}`)
            }
          }
        })

        acc.providerTools.push(...builtinTools)
        return acc
      }

      acc.clientTools[name] = definition as ToolInputMap[string]
      return acc
    },
    { clientTools: {}, providerTools: [] } as {
      clientTools: ClientTool
      providerTools: OpenAIToolList
    },
  )
}
