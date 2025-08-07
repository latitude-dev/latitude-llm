'use client'

import { KeyboardEvent, useCallback, useState } from 'react'

import { ToolMessage } from '@latitude-data/constants/legacyCompiler'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ToolBar } from './ToolBar'

type OnSubmitWithTools = (value: string | ToolMessage[]) => void
type OnSubmit = (value: string) => void

function SimpleTextArea({
  placeholder,
  canChat,
  clearChat,
  onSubmit,
  minRows = 1,
  maxRows = 10,
  disabled = false,
  disableReset = false,
}: {
  placeholder: string
  canChat: boolean
  clearChat: () => void
  minRows?: number
  maxRows?: number
  disabled?: boolean
  onSubmit?: (value: string) => void
  disableReset?: boolean
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
    <div className='flex flex-col w-full'>
      {canChat ? (
        <TextArea
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          minRows={minRows}
          maxRows={maxRows}
        />
      ) : null}
      <div className='w-full flex justify-center -mt-8'>
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
  return (
    <div className='flex relative w-full rounded-md'>
      <SimpleTextArea
        minRows={minRows}
        maxRows={maxRows}
        placeholder={placeholder}
        canChat={canChat}
        clearChat={clearChat}
        onSubmit={onSubmit}
        disabled={disabled}
        disableReset={disableReset}
      />
    </div>
  )
}
