import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
} from '@opentelemetry/semantic-conventions'
import {
  ATTR_HTTP_REQUEST_BODY,
  ATTR_HTTP_REQUEST_HEADER,
  ATTR_HTTP_REQUEST_HEADERS,
  ATTR_HTTP_REQUEST_URL,
  ATTR_HTTP_RESPONSE_BODY,
  ATTR_HTTP_RESPONSE_HEADER,
  ATTR_HTTP_RESPONSE_HEADERS,
  HttpSpanMetadata,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
} from '../../../browser'
import { database } from '../../../client'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import { SpanProcessArgs, toCamelCase } from './shared'

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
  const method = String(attributes[ATTR_HTTP_REQUEST_METHOD] ?? '')
  if (method) return Result.ok(method.toUpperCase())

  return Result.error(
    new UnprocessableEntityError('Request method is required'),
  )
}

function extractRequestUrl(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['url']> {
  const url = String(attributes[ATTR_HTTP_REQUEST_URL] ?? '')
  if (url) return Result.ok(url)

  return Result.error(new UnprocessableEntityError('Request URL is required'))
}

function extractRequestHeaders(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['headers']> {
  const attribute = String(attributes[ATTR_HTTP_REQUEST_HEADERS] ?? '')
  if (attribute) {
    try {
      return Result.ok(
        toCamelCase(JSON.parse(attribute) as Record<string, string>),
      )
    } catch (error) {
      return Result.error(
        new UnprocessableEntityError('Invalid request headers'),
      )
    }
  }

  const headers: Record<string, string> = {}
  for (const key in attributes) {
    if (!key.startsWith(ATTR_HTTP_REQUEST_HEADER)) continue
    const attribute = String(attributes[key] ?? '')
    const header = key.replace(ATTR_HTTP_REQUEST_HEADER + '.', '')
    headers[header] = attribute
  }

  return Result.ok(toCamelCase(headers))
}

function extractRequestBody(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['body']> {
  const attribute = String(attributes[ATTR_HTTP_REQUEST_BODY] ?? '')
  if (attribute) {
    try {
      return Result.ok(JSON.parse(attribute))
    } catch (error) {
      return Result.ok(attribute || {})
    }
  }

  return Result.ok({})
}

function extractResponseStatus(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['status']> {
  const status = Number(attributes[ATTR_HTTP_RESPONSE_STATUS_CODE] ?? NaN)
  if (!isNaN(status)) return Result.ok(status)

  return Result.error(
    new UnprocessableEntityError('Response status is required'),
  )
}

function extractResponseHeaders(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['headers']> {
  const attribute = String(attributes[ATTR_HTTP_RESPONSE_HEADERS] ?? '')
  if (attribute) {
    try {
      return Result.ok(
        toCamelCase(JSON.parse(attribute) as Record<string, string>),
      )
    } catch (error) {
      return Result.error(
        new UnprocessableEntityError('Invalid response headers'),
      )
    }
  }

  const headers: Record<string, string> = {}
  for (const key in attributes) {
    if (!key.startsWith(ATTR_HTTP_RESPONSE_HEADER)) continue
    const attribute = String(attributes[key] ?? '')
    const header = key.replace(ATTR_HTTP_RESPONSE_HEADER + '.', '')
    headers[header] = attribute
  }

  return Result.ok(toCamelCase(headers))
}

function extractResponseBody(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['body']> {
  const attribute = String(attributes[ATTR_HTTP_RESPONSE_BODY] ?? '')
  if (attribute) {
    try {
      return Result.ok(JSON.parse(attribute))
    } catch (error) {
      return Result.ok(attribute || {})
    }
  }

  return Result.ok({})
}
