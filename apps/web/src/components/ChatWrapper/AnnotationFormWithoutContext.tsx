import { useMemo } from 'react'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'
import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { useAnnotations } from './AnnotationsContext'

type AnnotationWithoutContext = {
  evaluation: EvaluationV2<EvaluationType.Human, HumanEvaluationMetric>
  result?: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>
}

function hasNoSelectedContexts(
  result: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>,
): boolean {
  if (!result.metadata) return true
  if (!('selectedContexts' in result.metadata)) return true
  const contexts = result.metadata.selectedContexts
  return !contexts || contexts.length === 0
}

export function AnnotationFormWithoutContext() {
  const { annotations, evaluations, span, handleAnnotate } = useAnnotations()
  const annotationsWithoutContext = useMemo((): AnnotationWithoutContext[] => {
    if (!evaluations || evaluations.length === 0) return []

    const typedAnnotations = annotations as
      | Array<{
          evaluation: EvaluationV2<EvaluationType.Human, HumanEvaluationMetric>
          result: EvaluationResultV2<
            EvaluationType.Human,
            HumanEvaluationMetric
          >
        }>
      | undefined

    const withoutContext = typedAnnotations?.filter((a) => hasNoSelectedContexts(a.result)) ?? [] // prettier-ignore
    if (withoutContext.length > 0) return withoutContext

    const firstEvaluation = evaluations[0] as EvaluationV2<
      EvaluationType.Human,
      HumanEvaluationMetric
    >
    return [{ evaluation: firstEvaluation, result: undefined }]
  }, [annotations, evaluations])

  if (!span || !evaluations || evaluations.length === 0) return null

  return (
    <div className='flex flex-col gap-4'>
      {annotationsWithoutContext.map((item, index) => (
        <AnnotationForm
          key={item.result?.uuid ?? `new-${index}`}
          evaluation={item.evaluation}
          result={item.result}
          span={span as SpanWithDetails<SpanType.Prompt>}
          onAnnotate={handleAnnotate}
        />
      ))}
    </div>
  )
}
