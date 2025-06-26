import { SPAN_SPECIFICATIONS, SpanType } from '../../../browser'
import { database, Database } from '../../../client'
import { Result } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Reranking]
export const RerankingSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  _: SpanProcessArgs<SpanType.Reranking>,
  __: Database = database,
) {
  return Result.ok({})
}
