import {
  type LatitudePromptConfig,
  type OpenAIToolList,
  openAIToolsList,
} from '@latitude-data/constants/latitudePromptSchema'
import { Result, type TypedResult } from '../../../../lib/Result'
import { type ResolvedProviderTool, type ResolvedTools, ToolSource } from './types'
import { type LatitudeError, NotFoundError, UnprocessableEntityError } from '../../../../lib/errors'
import { openai } from '@ai-sdk/openai'
import { Providers } from '@latitude-data/constants'

function resolveOpenAITools(openAITools: OpenAIToolList) {
  const result = openAIToolsList.safeParse(openAITools)

  if (result.error) return Result.error(new NotFoundError(result.error.message))

  // TODO: Handle multiple tools when file search is supported
  // https://github.com/vercel/ai/pull/5141
  const tool = result.data[0]

  if (!tool) return Result.error(new NotFoundError(`OpenAI Tool not found`))

  if (tool.type === 'file_search') {
    return Result.error(
      new UnprocessableEntityError('OpenAI file search tool is not supported yet at Latitude'),
    )
  }

  if (tool.type === 'computer_use_preview') {
    return Result.error(
      new UnprocessableEntityError('OpenAI computer use tool is not supported yet at Latitude'),
    )
  }

  return Result.ok({
    web_search_preview: {
      definition: openai.tools.webSearchPreview({
        searchContextSize: tool.search_context_size,
        userLocation: tool.user_location,
      }),
      sourceData: {
        source: ToolSource.ProviderTool,
        provider: Providers.OpenAI,
      },
    } satisfies ResolvedProviderTool,
  })
}

export function resolveProviderTools({
  config,
}: {
  config: LatitudePromptConfig
}): TypedResult<ResolvedTools, LatitudeError> {
  if (!config.tools) return Result.ok({})

  const tools = !Array.isArray(config.tools) ? [config.tools] : config.tools

  const result = tools.reduce(
    (acc, tool) => {
      if (typeof tool === 'string') return acc
      if (!('openai' in tool)) return acc

      const openAIResult = resolveOpenAITools(tool.openai as OpenAIToolList)

      if (openAIResult.error) {
        acc.error = openAIResult.error
        return acc
      }

      acc.tools = openAIResult.value

      return acc
    },
    {} as { tools?: ResolvedTools; error?: LatitudeError },
  )

  if (result.error) {
    return Result.error(result.error)
  }

  if (!result.tools) return Result.ok({})

  return Result.ok(result.tools)
}
