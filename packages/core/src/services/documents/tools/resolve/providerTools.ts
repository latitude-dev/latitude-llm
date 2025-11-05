import { Result } from '../../../../lib/Result'
import { ToolManifest } from '@latitude-data/constants/tools'
import { LatitudeError } from '../../../../lib/errors'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { StreamManager } from '../../../../lib/streamManager'
import { PromisedResult } from '../../../../lib/Transaction'
import {
  BadRequestError,
  NotFoundError,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'
import { openai } from '@ai-sdk/openai'
import { Providers } from '@latitude-data/constants'
import { Tool } from 'ai'

export async function resolveProviderToolDefinition({
  toolManifest,
}: {
  toolName: string
  toolManifest: ToolManifest<ToolSource.ProviderTool>
  streamManager: StreamManager
}): PromisedResult<Tool, LatitudeError> {
  const { provider, tool: openAITool } = toolManifest.sourceData

  if (provider !== Providers.OpenAI) {
    return Result.error(
      new BadRequestError(`Provider tools for '${provider}' not supported`),
    )
  }

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

  return Result.ok(
    openai.tools.webSearch({
      searchContextSize: openAITool.search_context_size,
      userLocation: openAITool.user_location,
    }),
  )
}
