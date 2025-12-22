import { database } from '../../../../client'
import { SPAN_SPECIFICATIONS, SpanType } from '../../../../constants'
import { Result } from '../../../../lib/Result'
import { SpanProcessArgs } from '../shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Embedding]
export const EmbeddingSpanSpecification = {
  ...specification,
  process: process,
}

async function process(_: SpanProcessArgs<SpanType.Embedding>, __ = database) {
  return Result.ok({})
}
