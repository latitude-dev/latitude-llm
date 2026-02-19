import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { type LlmEvaluationPromptParameter } from '@latitude-data/constants'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { type UseEvaluationParameters } from '../../../../hooks/useEvaluationParameters'
import { useDebouncedInput } from '../useDebouncedInput'

export function DebouncedTextArea({
  input,
  setInputs,
  param,
  disabled,
  minRows = 1,
  placeholder = 'Type here...',
}: {
  param: LlmEvaluationPromptParameter
  input: string
  setInputs: UseEvaluationParameters['history']['setInputs']
  disabled: boolean
  minRows?: number
  placeholder?: string
}) {
  const [localValue, setLocalValue] = useState(input ?? '')
  const setInputDebounced = useDebouncedInput({ param, setInputs })
  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setLocalValue(value)
      setInputDebounced(value)
    },
    [setInputDebounced],
  )

  useEffect(() => {
    setLocalValue(input ?? '')
  }, [input])

  return (
    <TextArea
      value={localValue}
      minRows={minRows}
      maxRows={6}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
