import {
  EvaluationType,
  EvaluationMetric,
  SpanWithDetails,
  SelectedContext,
  MainSpanType,
} from '@latitude-data/constants'
import { AnnotationFormProps } from '../index'

export type FormProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = AnnotationFormProps<T, M> & {
  span: SpanWithDetails<MainSpanType>
  initialExpanded?: boolean
  selectedContext?: SelectedContext
}
