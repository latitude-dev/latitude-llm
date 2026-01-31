import { z } from 'zod'
import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { env } from '@latitude-data/env'
import { LatitudeToolDefinition } from '../../../constants'
import { BadRequestError, LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'
import { ExtractToolArgs, ExtractToolResult } from './types'

const HANDINGER_API_URL = 'https://api.handinger.com/markdown'

export function adjustLocalURLs({
  markdown,
  url,
}: {
  markdown: string
  url: URL
}): string {
  const regex = /\[([^\]]+)\]\((\/[^)]+)\)/g

  return markdown.replace(regex, (match, text, path) => {
    if (path.startsWith('/')) {
      return `[${text}](${url.origin}${path})`
    }
    return match
  })
}

async function webExtract({
  url: _url,
}: ExtractToolArgs): PromisedResult<ExtractToolResult, LatitudeError> {
  if (!env.HANDINGER_API_KEY) {
    throw new BadRequestError('HANDINGER_API_KEY is not set')
  }

  let url: URL
  try {
    url = new URL(_url)
  } catch (_error) {
    return Result.error(new BadRequestError('Invalid URL'))
  }

  const requestParams = new URLSearchParams({ url: url.toString(), fresh: '1' })
  const requestHeaders = new Headers({
    Authorization: `Bearer ${env.HANDINGER_API_KEY}`,
  })
  return fetch(`${HANDINGER_API_URL}?${requestParams}`, {
    headers: requestHeaders,
  })
    .then(async (response) => {
      if (!response.ok) {
        return Result.error(
          new LatitudeError(`Failed to fetch ${url.toString()}`),
        )
      }
      const adjustedMarkdown = adjustLocalURLs({
        markdown: await response.text(),
        url,
      })
      return Result.ok({
        url: url.toString(),
        content: adjustedMarkdown,
      })
    })
    .catch((error) => {
      return Result.error(error as LatitudeError)
    })
}

export default {
  name: LatitudeTool.WebExtract,
  internalName: LatitudeToolInternalName.WebExtract,
  method: webExtract,
  definition: (context: TelemetryContext) => ({
    description: 'Given a URL, returns the contents of the page.',
    inputSchema: z.object({
      url: z.url().describe('The URL of the page to extract.'),
    }),
    outputSchema: z.object({
      url: z.string(),
      content: z
        .string()
        .describe('The full contents of the page in Markdown format.'),
    }),
    execute: async (args: ExtractToolArgs, toolCall) =>
      withTelemetryWrapper(webExtract, {
        toolName: LatitudeTool.WebExtract,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition
