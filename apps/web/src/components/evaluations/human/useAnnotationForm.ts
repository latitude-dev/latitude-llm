import { useCallback, FormEvent, use, useMemo } from 'react'
import { AnnotationContext } from '../Annotation/FormWrapper'

export function useAnnotationFormState({
  initialScore,
}: {
  initialScore?: number
  initialReason?: string
}) {
  const { setDisabled, onSubmit: onSubmitSave } = use(AnnotationContext)
  const onScoreChange = useCallback(
    (score?: number | undefined) => {
      // If score is null, consider it as no value and disable the button
      if (score === undefined) {
        setDisabled(true)
        return
      }

      const hasChanged = score !== initialScore
      setDisabled(!hasChanged)
    },
    [initialScore, setDisabled],
  )
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      const score = formData.get('score')
      const reason = formData.get('reason')
      onSubmitSave({
        score: Number(score),
        resultMetadata: { reason: String(reason) },
      })
    },
    [onSubmitSave],
  )

  return useMemo(() => ({ onScoreChange, onSubmit }), [onScoreChange, onSubmit])
}
