import {
  BodyParams,
  HandlerType,
  SDKOptions,
  UrlParams,
} from '$sdk/utils/types'
import { SDK_VERSION } from '$sdk/utils/version'

// TODO: Look into using native `fetch` in Node.js 18+
import nodeFetch, { Response } from 'node-fetch'

const MAX_RETRIES = 2

function getAuthHeader(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Latitude-SDK-Version': SDK_VERSION,
  }
}

function bodyToString(body: object = {}) {
  return JSON.stringify(body)
}
export async function makeRequest<H extends HandlerType>({
  method,
  handler,
  params,
  body,
  retries = 0,
  options,
}: {
  method: 'POST' | 'GET' | 'PUT' | 'DELETE'
  body?: BodyParams<H>
  handler: H
  params?: UrlParams<H>
  retries?: number
  options: SDKOptions
}): Promise<Response> {
  const { routeResolver, apiKey, source, retryMs } = options
  const url = routeResolver.resolve({ handler, params })

  const response = await nodeFetch(url, {
    method,
    headers: getAuthHeader(apiKey),
    body:
      method === 'POST'
        ? bodyToString({
            ...body,
            __internal: { source },
          })
        : undefined,
    signal: options.signal,
  })

  if (!response.ok && response.status > 500 && retries < MAX_RETRIES) {
    await new Promise((resolve) => setTimeout(resolve, retryMs))

    return makeRequest({
      handler,
      params,
      method,
      body,
      options,
      retries: retries + 1,
    })
  }

  return response
}
