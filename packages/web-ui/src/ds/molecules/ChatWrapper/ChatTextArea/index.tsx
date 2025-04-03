'use client'

import { KeyboardEvent, useCallback, useState } from 'react'

import TextareaAutosize from 'react-textarea-autosize'

import { ToolCallForm } from './ToolCallForm'
import { Message, ToolMessage, ToolCall } from '@latitude-data/compiler'
import { cn } from '../../../../lib/utils'
import { ToolBar } from './ToolBar'

function SimpleTextArea({
  placeholder,
  clearChat,
  onSubmit: onSubmitProp,
  disabled = false,
  disableReset = false,
}: {
  placeholder: string
  clearChat: () => void
  disabled?: boolean
  onSubmit?: (value: string) => void
  disableReset?: boolean
}) {
  const [value, setValue] = useState('')
  const onSubmit = useCallback(() => {
    if (disabled) return
    if (value === '') return
    setValue('')
    onSubmitProp?.(value)
  }, [value, onSubmitProp, disabled])
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit()
      }
    },
    [onSubmit],
  )
  return (
    <>
      <TextareaAutosize
        className='bg-transparent w-full px-2 pt-2 pb-14 resize-none text-sm'
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        minRows={1}
        maxRows={5}
      />
      <div className='absolute w-full -bottom-7 flex justify-center'>
        <ToolBar
          onSubmit={onSubmit}
          clearChat={clearChat}
          disabled={disabled}
          disableReset={disableReset}
        />
      </div>
    </>
  )
}

type OnSubmitWithTools = (value: string | ToolMessage[]) => void
type OnSubmit = (value: string) => void
export function ChatTextArea({
  placeholder,
  clearChat,
  onSubmit,
  disabled = false,
  toolRequests = [],
  addMessages,
  disableReset = false,
}: {
  placeholder: string
  clearChat: () => void
  disabled?: boolean
  onSubmit?: OnSubmit | OnSubmitWithTools
  addMessages?: (messages: Message[]) => void
  toolRequests?: ToolCall[]
  disableReset?: boolean
}) {
  return (
    <div
      className={cn(
        'flex relative w-full border border-border bg-secondary mb-7',
        'dark:bg-foreground/10 rounded-md',
      )}
    >
      {toolRequests.length > 0 && addMessages ? (
        <ToolCallForm
          placeholder='Fill in the tool call response here... (Cmd+Enter to submit)'
          toolRequests={toolRequests}
          sendToServer={onSubmit as OnSubmitWithTools}
          addLocalMessages={addMessages}
          clearChat={clearChat}
        />
      ) : (
        <SimpleTextArea
          placeholder={placeholder}
          clearChat={clearChat}
          onSubmit={onSubmit}
          disabled={disabled}
          disableReset={disableReset}
        />
      )}
    </div>
  )
}
