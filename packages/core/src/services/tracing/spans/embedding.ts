import { SPAN_SPECIFICATIONS, SpanType } from '../../../browser'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import type { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Embedding]
export const EmbeddingSpanSpecification = {
  ...specification,
  process: process,
}

async function process(_: SpanProcessArgs<SpanType.Embedding>, __ = database) {
  return Result.ok({})
}
