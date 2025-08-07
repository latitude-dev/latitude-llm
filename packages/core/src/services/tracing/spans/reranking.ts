import { SPAN_SPECIFICATIONS, SpanType } from '../../../browser'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import type { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Reranking]
export const RerankingSpanSpecification = {
  ...specification,
  process: process,
}

async function process(_: SpanProcessArgs<SpanType.Reranking>, __ = database) {
  return Result.ok({})
}
