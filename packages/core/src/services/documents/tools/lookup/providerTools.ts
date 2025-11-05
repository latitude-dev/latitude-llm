import {
  LatitudePromptConfig,
  OpenAIToolList,
  openAIToolSchema,
} from '@latitude-data/constants/latitudePromptSchema'
import { Result, TypedResult } from '../../../../lib/Result'
import { ToolManifest, ToolManifestDict } from '@latitude-data/constants/tools'
import {
  LatitudeError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../../../lib/errors'
import { openai } from '@ai-sdk/openai'
import { Providers } from '@latitude-data/constants'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { OpenAITool } from '../../../../../../constants/src/latitudePromptSchema/providers/openai'

function resolveOpenAITool(openAITool: OpenAITool) {
  const result = openAIToolSchema.safeParse(openAITool)

  if (result.error) return Result.error(new NotFoundError(result.error.message))

  if (!openAITool) {
    return Result.error(new NotFoundError(`OpenAI Tool not found`))
  }

  // TODO: Support file search
  // https://github.com/vercel/ai/pull/5141

  if (openAITool.type === 'file_search') {
    return Result.error(
      new UnprocessableEntityError(
        'OpenAI file search tool is not supported yet at Latitude',
      ),
    )
  }

  if (openAITool.type === 'computer_use_preview') {
    return Result.error(
      new UnprocessableEntityError(
        'OpenAI computer use tool is not supported yet at Latitude',
      ),
    )
  }

  const { description, inputSchema, outputSchema } = openai.tools.webSearch({
    searchContextSize: openAITool.search_context_size,
    userLocation: openAITool.user_location,
  })

  return Result.ok({
    web_search: {
      definition: {
        description,
        inputSchema,
        outputSchema,
      },
      sourceData: {
        source: ToolSource.ProviderTool,
        provider: Providers.OpenAI,
        tool: openAITool,
      },
    } satisfies ToolManifest<ToolSource.ProviderTool>,
  })
}

export function lookupProviderTools({
  config,
}: {
  config: Pick<LatitudePromptConfig, 'tools'>
}): TypedResult<ToolManifestDict<ToolSource.ProviderTool>, LatitudeError> {
  if (!config.tools) return Result.ok({})

  const tools = !Array.isArray(config.tools) ? [config.tools] : config.tools
  const openaiTools = tools.filter((tool) => {
    if (typeof tool === 'string') return false
    if (!('openai' in tool)) return false
    return true
  }) as { openai: OpenAIToolList }[]

  const lookedUpTools: ToolManifestDict<ToolSource.ProviderTool> = {}
  for (const tool of openaiTools) {
    for (const openaiTool of tool.openai) {
      const openAIResult = resolveOpenAITool(openaiTool)
      if (openAIResult.error) return Result.error(openAIResult.error)
      const [toolName, toolManifest] = Object.entries(openAIResult.value)[0]
      lookedUpTools[toolName] = toolManifest
    }
  }

  return Result.ok(lookedUpTools)
}
