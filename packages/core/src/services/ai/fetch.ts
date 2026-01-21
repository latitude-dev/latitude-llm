import { FetchFunction } from '@ai-sdk/provider-utils'
import { context as otelContext } from '@opentelemetry/api'
import { telemetry } from '../../telemetry'

export function instrumentedFetch(): FetchFunction {
  return async function (input, init) {
    // Use the currently active OpenTelemetry context
    // This allows HTTP spans to be children of whatever span is currently active
    // (e.g., a Completion span when called from the telemetry middleware)
    const activeContext = otelContext.active()

    const $http = telemetry.span.http(
      {
        request: await getRequest(input, init),
      },
      activeContext,
    )

    const result = fetch(input, init)

    result
      .then(async (response) => {
        $http.end({
          response: await getResponse(response.clone()),
        })
      })
      .catch((error) => $http.fail(error))

    return result
  }
}

async function getRequest(...parameters: Parameters<FetchFunction>) {
  const [input, init] = parameters

  try {
    let method
    if (init?.method) method = init.method
    else if (input instanceof Request) method = input.method
    method = method ?? 'UNKNOWN'

    let url
    if (typeof input === 'string') url = input
    else if (input instanceof URL) url = input.toString()
    else if (input?.url) url = input.url
    url = url ?? 'UNKNOWN'

    let headers
    if (init?.headers) headers = init.headers
    else if (input instanceof Request) headers = input.headers
    headers = headers ?? {}

    let body
    if (init?.body) body = init.body
    else if (input instanceof Request) body = input.body
    body = body ?? ''

    return {
      method: method,
      url: url,
      headers: await getHeaders(headers),
      body: await getBody(body),
    }
  } catch (error) {
    return {
      method: 'UNKNOWN',
      url: 'UNKNOWN',
      headers: {},
      body: '',
    }
  }
}

async function getResponse(response: Response) {
  try {
    return {
      status: response.status,
      headers: await getHeaders(response.headers),
      body: await getBody(response.text()),
    }
  } catch (error) {
    return {
      status: 0,
      headers: {},
      body: '',
    }
  }
}

async function getHeaders(headers: HeadersInit | Headers) {
  let source

  if (headers instanceof Headers) source = headers.entries()
  else if (Array.isArray(headers)) source = headers
  else source = Object.entries(headers)

  const copy: Record<string, string> = {}
  for (const [k, v] of source) copy[k] = v

  return copy
}

async function getBody(body: BodyInit | Promise<string>) {
  body = await body

  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()

  return ''
}
