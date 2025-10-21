import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { FormProps } from '../types'
import { EVALUATION_SPECIFICATIONS } from '../..'
import { AnnotationProvider } from '../FormWrapper'
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
      <spec.AnnotationForm evaluation={evaluation} result={result} />
    </AnnotationProvider>
  )
}
