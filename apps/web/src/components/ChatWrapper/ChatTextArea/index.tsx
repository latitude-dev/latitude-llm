'use client'

import { KeyboardEvent, useCallback, useState } from 'react'

import { ToolMessage } from '@latitude-data/constants/legacyCompiler'
import { ToolBar } from './ToolBar'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { cn } from '@latitude-data/web-ui/utils'

type OnSubmitWithTools = (value: string | ToolMessage[]) => void
type OnSubmit = (value: string) => void

export function ChatTextArea({
  placeholder,
  clearChat,
  onSubmit,
  disabled = false,
  disableReset = false,
  canChat,
  minRows = 1,
  maxRows = 10,
}: {
  placeholder: string
  canChat: boolean
  clearChat: () => void
  disabled?: boolean
  onSubmit?: OnSubmit | OnSubmitWithTools
  disableReset?: boolean
  minRows?: number
  maxRows?: number
}) {
  const [value, setValue] = useState('')
  const onSubmitHandler = useCallback(() => {
    if (disabled) return
    if (value === '') return
    setValue('')
    onSubmit?.(value)
  }, [value, onSubmit, disabled])
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmitHandler()
      }
    },
    [onSubmitHandler],
  )
  return (
    <div
      className={cn('flex relative w-full border mb-6 rounded-md', {
        'border-border bg-secondary dark:bg-foreground/10': canChat,
        'border-transparent': !canChat,
      })}
    >
      {canChat && (
        <TextArea
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          minRows={minRows}
          maxRows={maxRows}
        />
      )}
      <div className='absolute w-full -bottom-6 flex justify-center'>
        <ToolBar
          canChat={canChat}
          onSubmit={onSubmitHandler}
          clearChat={clearChat}
          disabled={disabled}
          disableReset={disableReset}
        />
      </div>
    </div>
  )
}
