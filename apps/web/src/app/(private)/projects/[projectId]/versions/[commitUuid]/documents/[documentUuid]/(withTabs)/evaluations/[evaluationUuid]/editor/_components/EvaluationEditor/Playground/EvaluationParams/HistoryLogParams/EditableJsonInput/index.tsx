import { useMemo, lazy, useState, useCallback, useRef, useEffect } from 'react'
import { type LlmEvaluationPromptParameter } from '@latitude-data/constants'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { type UseEvaluationParameters } from '../../../../hooks/useEvaluationParamaters'
import { type LogInput } from '../../../../hooks/useEvaluationParamaters/logInputParamaters'
import { InputWrapper } from '../InputWrapper'
import { useDebouncedInput } from '../useDebouncedInput'
import { useOnClickOutside } from '@latitude-data/web-ui/hooks/useOnClickOutside'

const TextEditor = lazy(() => import('./TextEditor/index'))

function parseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch (_e) {
    return { error: 'Invalid JSON', value }
  }
}

function JsonBlock({
  previewHeight,
  editing,
  onEdit,
  input,
  param,
  setInputs,
}: {
  previewHeight: number
  editing: boolean
  onEdit: () => void
  input: LogInput | undefined
  param: LlmEvaluationPromptParameter
  setInputs: UseEvaluationParameters['history']['setInputs']
}) {
  const value = input?.value ?? ''
  const jsonValue = useMemo(() => parseJson(value), [value])
  const setDebouncedInput = useDebouncedInput({ param, setInputs })
  const onChange = useCallback(
    (newValue: string | undefined) => {
      setDebouncedInput(newValue ?? '')
    },
    [setDebouncedInput],
  )
  if (!input) return null

  if (editing) {
    return (
      <TextEditor
        value={value}
        onChange={onChange}
        initialHeight={previewHeight}
      />
    )
  }

  return (
    <CodeBlock
      language='json'
      copy={false}
      action={
        <Button
          variant='nope'
          size='small'
          iconProps={{ name: 'pencil', color: 'foregroundMuted' }}
          onClick={onEdit}
        />
      }
    >
      {JSON.stringify(jsonValue, null, 2)}
    </CodeBlock>
  )
}

export function EditableJsonInput({
  param,
  input,
  setInputs,
}: {
  param: LlmEvaluationPromptParameter
  input: LogInput | undefined
  setInputs: UseEvaluationParameters['history']['setInputs']
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [editing, setEditing] = useState(false)
  const onClickEdit = useCallback(() => {
    setEditing(true)
  }, [])
  const onClickOutside = useCallback(async () => {
    setEditing(false)
  }, [])
  useOnClickOutside({
    ref,
    handler: onClickOutside,
    enabled: editing,
  })
  const [previewHeight, setPreviewHeight] = useState<number>(0)
  useEffect(() => {
    if (!ref.current) return

    setPreviewHeight(ref.current.offsetHeight)
  }, [previewHeight])
  return (
    <InputWrapper param={param} input={input}>
      <div ref={ref} className='w-full min-h-5'>
        <div className='overflow-hidden rounded-xl w-full'>
          <JsonBlock
            previewHeight={previewHeight}
            editing={editing}
            onEdit={onClickEdit}
            param={param}
            input={input}
            setInputs={setInputs}
          />
        </div>
      </div>
    </InputWrapper>
  )
}
