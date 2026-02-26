import { database } from '../../../../client'
import {
  ATTRIBUTES,
  HttpSpanMetadata,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
} from '../../../../constants'
import { UnprocessableEntityError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import {
  extractLatitudeReferences,
  SpanProcessArgs,
  toCamelCase,
} from '../shared'

const HTTP = ATTRIBUTES.OPENTELEMETRY.HTTP

const specification = SPAN_SPECIFICATIONS[SpanType.Http]
export const HttpSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, status }: SpanProcessArgs<SpanType.Http>,
  _ = database,
) {
  const extractingqm = extractRequestMethod(attributes)
  if (extractingqm.error) return Result.error(extractingqm.error)
  const requestMethod = extractingqm.value

  const extractingqu = extractRequestUrl(attributes)
  if (extractingqu.error) return Result.error(extractingqu.error)
  const requestUrl = extractingqu.value

  const extractingqh = extractRequestHeaders(attributes)
  if (extractingqh.error) return Result.error(extractingqh.error)
  const requestHeaders = extractingqh.value

  const extractingqb = extractRequestBody(attributes)
  if (extractingqb.error) return Result.error(extractingqb.error)
  const requestBody = extractingqb.value

  if (status === SpanStatus.Error) {
    return Result.ok({
      ...extractLatitudeReferences(attributes),
      request: {
        method: requestMethod,
        url: requestUrl,
        headers: requestHeaders,
        body: requestBody,
      },
    })
  }

  const extractingss = extractResponseStatus(attributes)
  if (extractingss.error) return Result.error(extractingss.error)
  const responseStatus = extractingss.value

  const extractingsh = extractResponseHeaders(attributes)
  if (extractingsh.error) return Result.error(extractingsh.error)
  const responseHeaders = extractingsh.value

  const extractingsb = extractResponseBody(attributes)
  if (extractingsb.error) return Result.error(extractingsb.error)
  const responseBody = extractingsb.value

  return Result.ok({
    ...extractLatitudeReferences(attributes),
    request: {
      method: requestMethod,
      url: requestUrl,
      headers: requestHeaders,
      body: requestBody,
    },
    response: {
      status: responseStatus,
      headers: responseHeaders,
      body: responseBody,
    },
  })
}

function extractRequestMethod(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['method']> {
  const method = String(attributes[HTTP.request.method] ?? '')
  if (method) return Result.ok(method.toUpperCase())

  return Result.error(
    new UnprocessableEntityError('Request method is required'),
  )
}

function extractRequestUrl(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['url']> {
  const url = String(attributes[HTTP.request.url] ?? '')
  if (url) return Result.ok(url)

  return Result.error(new UnprocessableEntityError('Request URL is required'))
}

function extractRequestHeaders(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['headers']> {
  const attribute = String(attributes[HTTP.request.headers] ?? '')
  if (attribute) {
    try {
      return Result.ok(
        toCamelCase(JSON.parse(attribute) as Record<string, string>),
      )
    } catch (_error) {
      return Result.error(
        new UnprocessableEntityError('Invalid request headers'),
      )
    }
  }

  const headers: Record<string, string> = {}
  for (const key in attributes) {
    if (!key.startsWith(HTTP.request.header)) continue
    const attribute = String(attributes[key] ?? '')
    const header = key.replace(HTTP.request.header + '.', '')
    headers[header] = attribute
  }

  return Result.ok(toCamelCase(headers))
}

function extractRequestBody(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['body']> {
  const attribute = String(attributes[HTTP.request.body] ?? '')
  if (attribute) {
    try {
      return Result.ok(JSON.parse(attribute))
    } catch (_error) {
      return Result.ok(attribute || {})
    }
  }

  return Result.ok({})
}

function extractResponseStatus(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['status']> {
  const status = Number(attributes[HTTP.response.statusCode] ?? NaN)
  if (!isNaN(status)) return Result.ok(status)

  return Result.error(
    new UnprocessableEntityError('Response status is required'),
  )
}

function extractResponseHeaders(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['headers']> {
  const attribute = String(attributes[HTTP.response.headers] ?? '')
  if (attribute) {
    try {
      return Result.ok(
        toCamelCase(JSON.parse(attribute) as Record<string, string>),
      )
    } catch (_error) {
      return Result.error(
        new UnprocessableEntityError('Invalid response headers'),
      )
    }
  }

  const headers: Record<string, string> = {}
  for (const key in attributes) {
    if (!key.startsWith(HTTP.response.header)) continue
    const attribute = String(attributes[key] ?? '')
    const header = key.replace(HTTP.response.header + '.', '')
    headers[header] = attribute
  }

  return Result.ok(toCamelCase(headers))
}

function extractResponseBody(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['body']> {
  const attribute = String(attributes[HTTP.response.body] ?? '')
  if (attribute) {
    try {
      return Result.ok(JSON.parse(attribute))
    } catch (_error) {
      return Result.ok(attribute || {})
    }
  }

  return Result.ok({})
}
