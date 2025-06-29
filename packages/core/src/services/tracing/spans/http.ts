import {
  HttpSpanMetadata,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
} from '../../../browser'
import { database, Database } from '../../../client'
import { Result, TypedResult } from './../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Http]
export const HttpSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, status }: SpanProcessArgs<SpanType.Http>,
  _: Database = database,
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
  return Result.nil()
}

function extractRequestUrl(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['url']> {
  return Result.nil()
}

function extractRequestHeaders(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['headers']> {
  return Result.nil()
}

function extractRequestBody(
  attributes: Record<string, SpanAttribute>,
): TypedResult<HttpSpanMetadata['request']['body']> {
  return Result.nil()
}

function extractResponseStatus(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['status']> {
  return Result.nil()
}

function extractResponseHeaders(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['headers']> {
  return Result.nil()
}

function extractResponseBody(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<HttpSpanMetadata>['response']['body']> {
  return Result.nil()
}
