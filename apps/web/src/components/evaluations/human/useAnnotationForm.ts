import { useCallback, use, useMemo, useState } from 'react'
import { AnnotationContext } from '../Annotation/FormWrapper'
import { useDebouncedCallback } from 'use-debounce'
import {
  EvaluationResultMetadata,
  EvaluationType,
  HumanEvaluationMetric,
} from '@latitude-data/constants'

export function useAnnotationFormState({ score }: { score?: number }) {
  const { result, onSubmit } = use(AnnotationContext)
  const [reason, setReason] = useState(() => {
    if (!result) return ''
    if (!result.metadata) return ''
    if (!('reason' in result.metadata)) return ''
    return result.metadata.reason || ''
  })
  const onReasonChangeDebounced = useDebouncedCallback(
    ({
      score,
      resultMetadata,
    }: {
      score: number
      reason: string
      resultMetadata: Partial<
        EvaluationResultMetadata<EvaluationType.Human, HumanEvaluationMetric>
      >
    }) => {
      onSubmit({ score, resultMetadata: { ...resultMetadata, reason } })
    },
    500,
  )

  const onChangeReason = useCallback(
    (value: string) => {
      setReason(value)

      // Score should always be defined at this point since textarea is only visible after user provides feedback
      if (score === undefined) {
        console.error('Score is undefined when trying to update reason')
        return
      }

      onReasonChangeDebounced({
        score,
        reason: value,
        resultMetadata: result?.metadata ?? {},
      })
    },
    [score, result, onReasonChangeDebounced],
  )

  return useMemo(() => ({ onChangeReason, reason }), [onChangeReason, reason])
}
