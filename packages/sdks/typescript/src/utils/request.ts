import {
  BodyParams,
  HandlerType,
  SDKOptions,
  UrlParams,
} from '$sdk/utils/types'
import nodeFetch, { Response } from 'node-fetch'

const MAX_RETRIES = 2

function getAuthHeader(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
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
  params: UrlParams<H>
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
  } else if (!response.ok) {
    let error = ''
    try {
      error = await response.text()

      const { message } = JSON.parse(error) as {
        errorCode: string
        message: string
        dbErrorRef: string
      }

      throw new Error(
        `Request to ${url} failed with status ${response.status}: ${message}`,
      )
    } catch (e) {
      if (error) {
        throw new Error(
          `Request to ${url} failed with status ${response.status}: ${error}`,
        )
      } else {
        throw new Error(
          `Request to ${url} failed with status ${response.status}`,
        )
      }
    }
  }

  return response
}
