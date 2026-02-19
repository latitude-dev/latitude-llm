import { type LlmEvaluationPromptParameter } from '@latitude-data/constants'
import { useDebouncedCallback } from 'use-debounce'
import { type UseEvaluationParameters } from '../../../hooks/useEvaluationParameters'

export function useDebouncedInput({
  setInputs,
  param,
}: {
  param: LlmEvaluationPromptParameter
  setInputs: UseEvaluationParameters['history']['setInputs']
}) {
  return useDebouncedCallback(
    async (value: string) => {
      setInputs({ [param]: value })
    },
    100,
    { leading: false, trailing: true },
  )
}
