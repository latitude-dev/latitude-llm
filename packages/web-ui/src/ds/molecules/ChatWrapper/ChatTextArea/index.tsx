'use client'

import { KeyboardEvent, useCallback, useState } from 'react'

import TextareaAutosize from 'react-textarea-autosize'

import { ToolCallForm } from './ToolCallForm'
import { Message, ToolMessage, ToolCall } from '@latitude-data/compiler'
import { cn } from '../../../../lib/utils'
import { ToolBar } from './ToolBar'

function SimpleTextArea({
  placeholder,
  canChat,
  clearChat,
  onSubmit: onSubmitProp,
  disabled = false,
  disableReset = false,
}: {
  placeholder: string
  canChat: boolean
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
      {canChat ? (
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
      ) : null}
      <div className='absolute w-full -bottom-3 flex justify-center'>
        <ToolBar
          canChat={canChat}
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
  canChat,
}: {
  placeholder: string
  canChat: boolean
  clearChat: () => void
  disabled?: boolean
  onSubmit?: OnSubmit | OnSubmitWithTools
  addMessages?: (messages: Message[]) => void
  toolRequests?: ToolCall[]
  disableReset?: boolean
}) {
  return (
    <div
      className={cn('flex relative w-full border mb-6 rounded-md', {
        'border-border bg-secondary dark:bg-foreground/10': canChat,
        'border-transparent': !canChat,
      })}
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
          canChat={canChat}
          clearChat={clearChat}
          onSubmit={onSubmit}
          disabled={disabled}
          disableReset={disableReset}
        />
      )}
    </div>
  )
}
