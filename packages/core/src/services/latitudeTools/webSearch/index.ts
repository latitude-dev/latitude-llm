import { z } from 'zod'
import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { env } from '@latitude-data/env'
import { tavily } from '@tavily/core'
import { LatitudeToolDefinition } from '../../../constants'
import { BadRequestError, LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'
import { SearchToolArgs, SearchToolResult } from './types'

async function webSearch({
  query,
  topic,
  days,
  maxResults,
}: SearchToolArgs): PromisedResult<SearchToolResult, LatitudeError> {
  if (!env.TAVILY_API_KEY) {
    throw new BadRequestError('TAVILY_API_KEY is not set')
  }

  const client = tavily({ apiKey: env.TAVILY_API_KEY })
  return client
    .search(query, {
      topic,
      days,
      maxResults,
    })
    .then((response) => {
      return Result.ok(response)
    })
    .catch((error) => {
      return Result.error(error)
    })
}

export default {
  name: LatitudeTool.WebSearch,
  internalName: LatitudeToolInternalName.WebSearch,
  method: webSearch,
  definition: (context?: TelemetryContext) => ({
    description:
      'Search the web for information.\n' +
      'Given a query, this tool will search the web for information and return the results.\n' +
      'The tool will return a quick answer, and a list of links to relevant results,',
    inputSchema: z.object({
      query: z.string().min(1).max(200).describe('The query to search for.'),
      topic: z
        .enum(['general', 'news', 'finance'])
        .default('general')
        .describe('The category of the search. Defaults to "general".'),
      days: z
        .int()
        .optional()
        .describe(
          'The number of days to search for. Available only if topic is `news`.',
        ),
      maxResults: z
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe('The maximum number of results to return. Defaults to 5.'),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          content: z.string().describe('The metadata of the search result.'),
        }),
      ),
    }),
    execute: async (args: SearchToolArgs, toolCall) =>
      withTelemetryWrapper(webSearch, {
        toolName: LatitudeTool.WebSearch,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition
