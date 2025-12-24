import {
  EvaluationType,
  EvaluationMetric,
  SpanWithDetails,
  SpanType,
  SelectedContext,
} from '@latitude-data/constants'
import { AnnotationFormProps } from '../index'

export type FormProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = AnnotationFormProps<T, M> & {
  span: SpanWithDetails<SpanType.Prompt>
  initialExpanded?: boolean
  selectedContext?: SelectedContext
}
