import { ToolMessage } from '@latitude-data/constants/legacyCompiler'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { cn } from '@latitude-data/web-ui/utils'
import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ToolBar } from './ToolBar'

type OnSubmitWithTools = (value: string | ToolMessage[]) => void
type OnSubmit = (value: string) => void

function SimpleTextArea({
  placeholder,
  onSubmit,
  onBack,
  onChange,
  onBackLabel,
  onSubmitLabel,
  minRows = 1,
  maxRows = 10,
  disabledSubmit = false,
  disabledBack = false,
  canSubmitWithEmptyValue = false,
}: {
  placeholder: string
  minRows?: number
  maxRows?: number
  onSubmit?: (value: string) => void
  onBack?: () => void
  onChange?: (value: string) => void
  onBackLabel?: string
  onSubmitLabel?: string
  disabledSubmit?: boolean
  disabledBack?: boolean
  canSubmitWithEmptyValue?: boolean
}) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const wasDisabledRef = useRef(disabledSubmit)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (wasDisabledRef.current && !disabledSubmit) {
      textAreaRef.current?.focus()
    }
    wasDisabledRef.current = disabledSubmit
  }, [disabledSubmit])

  const onSubmitHandler = useCallback(() => {
    if (disabledSubmit) return
    if (value === '' && !canSubmitWithEmptyValue) return
    setValue('')
    onSubmit?.(value)
  }, [value, onSubmit, disabledSubmit, canSubmitWithEmptyValue])
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmitHandler()
      }
    },
    [onSubmitHandler],
  )
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
      onChange?.(e.target.value)
    },
    [onChange],
  )
  return (
    <div className='flex flex-col w-full'>
      <TextArea
        ref={textAreaRef}
        disabled={disabledSubmit}
        className={cn(
          'bg-background w-full p-3 resize-none text-sm rounded-2xl',
          'border-primary/50 border shadow-sm text-muted-foreground',
          'ring-0 focus-visible:ring-0 outline-none focus-visible:outline-none',
          'focus-visible:animate-glow focus-visible:glow-primary custom-scrollbar scrollable-indicator',
        )}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        minRows={minRows}
        maxRows={maxRows}
        autoGrow={value !== ''}
      />
      <div className='w-full flex justify-center -mt-8'>
        <ToolBar
          onSubmit={onSubmitHandler}
          onBack={onBack}
          onBackLabel={onBackLabel}
          onSubmitLabel={onSubmitLabel}
          disabledSubmit={disabledSubmit}
          disabledBack={disabledBack}
        />
      </div>
    </div>
  )
}

export function ChatTextArea({
  placeholder,
  onSubmit,
  onBack,
  onBackLabel,
  onSubmitLabel,
  disabledSubmit = false,
  disabledBack = false,
  minRows = 1,
  maxRows = 10,
  onChange,
  canSubmitWithEmptyValue,
}: {
  placeholder: string
  minRows?: number
  maxRows?: number
  onSubmit?: OnSubmit | OnSubmitWithTools
  onBack?: () => void
  onBackLabel?: string
  onSubmitLabel?: string
  disabledSubmit?: boolean
  disabledBack?: boolean
  onChange?: (value: string) => void
  canSubmitWithEmptyValue?: boolean
}) {
  return (
    <div className='flex relative w-full'>
      <SimpleTextArea
        minRows={minRows}
        maxRows={maxRows}
        placeholder={placeholder}
        onSubmit={onSubmit}
        onBack={onBack}
        onSubmitLabel={onSubmitLabel}
        onChange={onChange}
        onBackLabel={onBackLabel}
        disabledSubmit={disabledSubmit}
        disabledBack={disabledBack}
        canSubmitWithEmptyValue={canSubmitWithEmptyValue}
      />
    </div>
  )
}
