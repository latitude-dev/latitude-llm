'use client'

import { ToolMessage } from '@latitude-data/constants/messages'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { cn } from '@latitude-data/web-ui/utils'
import { KeyboardEvent, useCallback, useState } from 'react'
import { ToolBar } from './ToolBar'

type OnSubmitWithTools = (value: string | ToolMessage[]) => void
type OnSubmit = (value: string) => void

function SimpleTextArea({
  placeholder,
  onSubmit,
  onClear,
  minRows = 1,
  maxRows = 10,
  disabledSubmit = false,
  disabledClear = false,
  canChat = true,
}: {
  placeholder: string
  minRows?: number
  maxRows?: number
  onSubmit?: (value: string) => void
  onClear: () => void
  disabledSubmit?: boolean
  disabledClear?: boolean
  canChat?: boolean
}) {
  const [value, setValue] = useState('')
  const onSubmitHandler = useCallback(() => {
    if (disabledSubmit) return
    if (value === '') return
    setValue('')
    onSubmit?.(value)
  }, [value, onSubmit, disabledSubmit])
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
    <div className='flex flex-col w-full'>
      {canChat && (
        <TextArea
          disabled={disabledSubmit}
          className={cn(
            'bg-background w-full p-3 resize-none text-sm rounded-2xl',
            'border-primary/50 border shadow-sm text-muted-foreground',
            'ring-0 focus-visible:ring-0 outline-none focus-visible:outline-none',
            'focus-visible:animate-glow focus-visible:glow-primary custom-scrollbar scrollable-indicator',
          )}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          minRows={minRows}
          maxRows={maxRows}
          autoGrow={value !== ''}
        />
      )}
      <div className='w-full flex justify-center -mt-8'>
        <ToolBar
          canChat={canChat}
          onSubmit={onSubmitHandler}
          onClear={onClear}
          disabledSubmit={disabledSubmit}
          disabledClear={disabledClear}
        />
      </div>
    </div>
  )
}

export function ChatTextArea({
  placeholder,
  onSubmit,
  onClear,
  disabledSubmit = false,
  disabledClear = false,
  minRows = 1,
  maxRows = 10,
  canChat = true,
}: {
  placeholder: string
  minRows?: number
  maxRows?: number
  onSubmit?: OnSubmit | OnSubmitWithTools
  onClear: () => void
  disabledSubmit?: boolean
  disabledClear?: boolean
  canChat?: boolean
}) {
  return (
    <div className='flex relative w-full'>
      <SimpleTextArea
        minRows={minRows}
        maxRows={maxRows}
        placeholder={placeholder}
        onSubmit={onSubmit}
        onClear={onClear}
        disabledSubmit={disabledSubmit}
        disabledClear={disabledClear}
        canChat={canChat}
      />
    </div>
  )
}
