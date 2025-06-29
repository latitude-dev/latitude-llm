import { SPAN_SPECIFICATIONS, SpanType } from '../../../browser'
import { database, Database } from '../../../client'
import { Result } from './../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Http]
export const HttpSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  _: SpanProcessArgs<SpanType.Http>,
  __: Database = database,
) {
  return Result.ok({})
}
