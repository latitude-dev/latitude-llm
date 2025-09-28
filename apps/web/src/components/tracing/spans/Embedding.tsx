import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { SPAN_COLORS } from './shared'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/constants'

const specification = SPAN_SPECIFICATIONS[SpanType.Embedding]
export default {
  ...specification,
  icon: 'database' as IconName,
  color: SPAN_COLORS.purple,
}
