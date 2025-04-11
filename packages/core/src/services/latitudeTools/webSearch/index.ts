import { tavily } from '@tavily/core'
import { env } from '@latitude-data/env'
import { LatitudeToolDefinition } from '../../../constants'
import { SearchToolArgs, SearchToolResult } from './types'
import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { BadRequestError } from './../../../lib/errors'
import { LatitudeError } from './../../../lib/errors'
import { PromisedResult } from './../../../lib/Transaction'
import { Result } from './../../../lib/Result'

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
  definition: {
    description:
      'Search the web for information.\n' +
      'Given a query, this tool will search the web for information and return the results.\n' +
      'The tool will return a quick answer, and a list of links to relevant results,',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The query to search for.',
        },
        topic: {
          type: 'string',
          enum: ['general', 'news', 'finance'],
          description: 'The category of the search. Defaults to "general".',
        },
        days: {
          type: 'integer',
          description:
            'The number of days to search for. Available only if topic is `news`.',
        },
        maxResults: {
          type: 'integer',
          description:
            'The maximum number of results to return. Defaults to 5.',
        },
      },
      required: ['query'],
    },
  },
} as LatitudeToolDefinition
