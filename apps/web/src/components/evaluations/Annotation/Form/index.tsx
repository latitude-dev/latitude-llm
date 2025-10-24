import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { EVALUATION_SPECIFICATIONS } from '../..'
import { AnnotationProvider } from '../FormWrapper'
import { FormProps } from '../types'
import { useAnnotationForm } from '../useAnnotationForm'

export function AnnotationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  isAnnotatingEvaluation,
  annotateEvaluation,
  mutateEvaluationResults,
  evaluation,
  providerLog,
  documentLog,
  commit,
  result,
}: FormProps<T, M>) {
  const spec = EVALUATION_SPECIFICATIONS[evaluation.type]
  const { onSubmit, isSubmitting } = useAnnotationForm<T, M>({
    isAnnotatingEvaluation,
    annotateEvaluation,
    mutateEvaluationResults,
    evaluation,
    providerLog,
    documentLog,
    commit,
  })

  if (!spec.AnnotationForm) return null

  return (
    <AnnotationProvider onSubmit={onSubmit} isSubmitting={isSubmitting}>
      <spec.AnnotationForm
        metric={evaluation.metric}
        evaluation={evaluation}
        result={result}
      />
    </AnnotationProvider>
  )
}
