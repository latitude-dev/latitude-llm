'use client'

import { KeyboardEvent, useCallback, useState } from 'react'

import TextareaAutosize from 'react-textarea-autosize'

import { Button } from '../../../atoms'

export function ChatTextArea({
  placeholder,
  clearChat,
  onSubmit,
  disabled = false,
}: {
  placeholder: string
  clearChat: () => void
  disabled?: boolean
  onSubmit?: (value: string) => void
}) {
  const [value, setValue] = useState('')

  const handleSubmit = useCallback(() => {
    if (disabled) return
    if (value === '') return
    setValue('')
    onSubmit?.(value)
  }, [value, onSubmit, disabled])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  return (
    <div className='flex relative w-full border border-border bg-secondary rounded-md'>
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
      <div className='absolute bottom-4 right-4 flex flex-row gap-2 items-center'>
        <Button fancy variant='outline' onClick={clearChat}>
          Reset Chat
        </Button>
        <Button fancy disabled={disabled} onClick={handleSubmit}>
          Send Message
        </Button>
      </div>
    </div>
  )
}
