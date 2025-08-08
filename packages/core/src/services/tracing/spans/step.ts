import { SPAN_SPECIFICATIONS, SpanType } from '../../../browser'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Step]
export const StepSpanSpecification = {
  ...specification,
  process: process,
}

async function process(_: SpanProcessArgs<SpanType.Step>, __ = database) {
  return Result.ok({})
}
