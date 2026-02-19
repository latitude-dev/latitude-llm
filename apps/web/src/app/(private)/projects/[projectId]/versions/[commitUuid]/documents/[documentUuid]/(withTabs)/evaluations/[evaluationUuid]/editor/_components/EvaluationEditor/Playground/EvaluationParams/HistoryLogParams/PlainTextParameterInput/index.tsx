import { type UseEvaluationParameters } from '../../../../hooks/useEvaluationParameters'
import { LogInput } from '../../../../hooks/useEvaluationParameters/logInputParameters'
import { DebouncedTextArea } from '../DebouncedTextArea'
import { LlmEvaluationPromptParameter } from '@latitude-data/constants'
import { InputWrapper } from '../InputWrapper'

export function PlainTextParameterInput({
  param,
  input,
  setInputs,
  isLoading,
  minRows,
  placeholder,
}: {
  param: LlmEvaluationPromptParameter
  input: LogInput | undefined
  setInputs: UseEvaluationParameters['history']['setInputs']
  isLoading: boolean
  minRows?: number
  placeholder?: string
}) {
  if (!input) return null

  const value = input.value ?? ''
  return (
    <InputWrapper param={param} input={input}>
      <DebouncedTextArea
        param={param}
        input={value}
        setInputs={setInputs}
        disabled={isLoading}
        minRows={minRows}
        placeholder={placeholder}
      />
    </InputWrapper>
  )
}
