import { database } from '../../../client'
import { SPAN_SPECIFICATIONS, SpanType } from '../../../constants'
import { Result } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Retrieval]
export const RetrievalSpanSpecification = {
  ...specification,
  process: process,
}

async function process(_: SpanProcessArgs<SpanType.Retrieval>, __ = database) {
  return Result.ok({})
}
