import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/browser'
import type { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { SPAN_COLORS } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Retrieval]
export default {
  ...specification,
  icon: 'search' as IconName,
  color: SPAN_COLORS.purple,
}
