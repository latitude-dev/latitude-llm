import { database } from '../../../../client'
import { SPAN_SPECIFICATIONS, SpanType } from '../../../../constants'
import { Result } from '../../../../lib/Result'
import { extractLatitudeReferences, SpanProcessArgs } from '../shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Unknown]
export const UnknownSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes }: SpanProcessArgs<SpanType.Unknown>,
  _ = database,
) {
  return Result.ok(extractLatitudeReferences(attributes))
}
