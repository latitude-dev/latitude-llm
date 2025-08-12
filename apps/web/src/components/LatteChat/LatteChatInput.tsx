'use client'

import { LatteChange } from '@latitude-data/constants/latte'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useTypeWriterValue } from '@latitude-data/web-ui/browser'
import { cn } from '@latitude-data/web-ui/utils'
import React, { KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { ChangeList } from './_components/ChangesList'

const INPUT_PLACEHOLDERS = [
  'How can I see the logs of my agent?',
  'Optimize my prompts cost without sacrificing performance.',
  'What is an evaluation?',
  'How can I give context to an agent?',
  'Find why my AI is not performing as expected.',
  'Tell me about PromptL best practices.',
  'Create a workflow that extracts data from PDFs, summarizes it, and stores it in a database.',
  'Create an AI Agent that automatically responds to support tickets.',
  'How can I run an A/B test?',
  'Make my prompt more effective at extracting key insights from a financial report.',
  'What’s the best way to organize my subagents?',
  'Create a prompt that categorizes tickets based on their content.',
  'Turn this simple chatbot prompt into a multi-step AI agent that first searches the web and then summarizes the results.',
]

export function LatteChatInput({
  sendMessage,
  resetChat,
  changes,
  undoChanges,
  acceptChanges,
  error,
  scrollToBottom,
  isLoading,
  inConversation,
  feedbackRequested,
  addFeedbackToLatteChange,
}: {
  isLoading: boolean
  inConversation: boolean
  scrollToBottom: () => void
  sendMessage: (message: string) => void
  changes: LatteChange[]
  error?: string
  resetChat: () => void
  acceptChanges: () => void
  undoChanges: () => void
  feedbackRequested?: boolean
  addFeedbackToLatteChange?: (
    feedback: string,
    evaluationResultUuid?: string,
  ) => void
}) {
  const placeholder = useTypeWriterValue(
    inConversation ? [] : INPUT_PLACEHOLDERS,
  )

  const [value, setValue] = useState('')
  const [action, setAction] = useState<'accept' | 'undo'>('accept')

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setValue(newValue)
    },
    [],
  )

  const onSubmit = useCallback(() => {
    if (isLoading) return
    if (value.trim() === '') return
    setValue('')
    sendMessage(value)
  }, [value, sendMessage, isLoading])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit()

        scrollToBottom()
      }
    },
    [scrollToBottom, onSubmit],
  )

  return (
    <div
      className={cn('pt-0 w-full relative flex flex-col gap-0', {
        'max-w-[600px]': !inConversation,
      })}
    >
      {!changes.length && feedbackRequested ? (
        <LatteChangesFeedback
          onSubmit={addFeedbackToLatteChange!}
          action={action}
        />
      ) : (
        <ChangeList
          changes={changes}
          undoChanges={() => {
            setAction('undo')
            undoChanges()
          }}
          acceptChanges={() => {
            setAction('accept')
            acceptChanges()
          }}
          disabled={isLoading}
        />
      )}
      <TextArea
        className={cn(
          'bg-background w-full px-3 pt-3 pb-14 resize-none text-sm',
          'rounded-2xl border-latte-widget border-2 shadow-sm text-muted-foreground',
          'ring-0 focus-visible:ring-0 outline-none focus-visible:outline-none',
          'focus-visible:animate-glow focus-visible:glow-latte custom-scrollbar scrollable-indicator',
          {
            'rounded-t-none border-t-0':
              changes.length > 0 || feedbackRequested,
          },
        )}
        placeholder={
          inConversation
            ? isLoading
              ? 'Brewing...'
              : 'Brew anything'
            : placeholder
        }
        autoGrow={value !== ''}
        disabled={isLoading || !!error}
        value={value}
        onChange={handleValueChange}
        onKeyDown={handleKeyDown}
        minRows={3}
        maxRows={value === '' ? 3 : 9} // Note: fixes auto-grow with dynamic placeholder
      />
      <div
        className={cn(
          'absolute bottom-[2px] left-3 w-[calc(100%-0.75rem-2px)] pt-2 pb-3 pr-3',
          'flex flex-row-reverse items-end justify-between bg-background rounded-br-2xl',
        )}
      >
        <Button
          variant='latte'
          onClick={onSubmit}
          disabled={isLoading || !!error || value.trim() === ''}
          iconProps={{
            name: 'forward',
            color: 'latteInputForeground',
            className: 'flex-shrink-0 rotate-180',
            placement: 'right',
          }}
          userSelect={false}
          containerClassName='!rounded-[0.55rem]'
          className='!rounded-[0.55rem]'
          innerClassName='!rounded-[0.55rem]'
          fancy
        >
          Send
        </Button>
        {inConversation && (
          <Button
            variant='ghost'
            size='none'
            onClick={resetChat}
            iconProps={{
              name: 'plus',
              color: 'latteInputForeground',
              className:
                'flex-shrink-0 group-hover:text-latte-input-foreground/75',
            }}
            className='text-latte-input-foreground group-hover:text-latte-input-foreground/75'
            userSelect={false}
          >
            New chat
          </Button>
        )}
      </div>
    </div>
  )
}

function LatteChangesFeedback({
  onSubmit,
  action,
}: {
  onSubmit: (feedback: string, evaluationResultUuid?: string) => void
  action: 'accept' | 'undo'
}) {
  const [value, setValue] = useState('')
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit(value)
      }
    },
    [onSubmit, value],
  )

  const [progress, setProgress] = useState(100)
  const [isTimerActive, setIsTimerActive] = useState(true)
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false)

  const handleSubmit = useCallback(() => {
    setHasAutoSubmitted(true)
    onSubmit('')
  }, [setHasAutoSubmitted, onSubmit])

  useEffect(() => {
    if (value.trim() === '' && !hasAutoSubmitted) {
      // Start/restart timer when feedback is empty and hasn't auto-submitted yet
      setIsTimerActive(true)
      setProgress(100)

      const totalTime = 10 * 1000 // 10 seconds
      const interval = 100 // Update every 100ms
      const decrement = (100 * interval) / totalTime

      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev - decrement
          if (newProgress <= 0) {
            clearInterval(progressInterval)
            // Defer the submit to avoid React state update during render
            setTimeout(() => handleSubmit(), 0)
            return 0
          }
          return newProgress
        })
      }, interval)

      return () => clearInterval(progressInterval)
    } else {
      // Stop timer when feedback is not empty or has already auto-submitted
      setIsTimerActive(false)
      setProgress(0)
    }
  }, [value, handleSubmit, hasAutoSubmitted])

  return (
    <div className='flex flex-col gap-2 border-latte-widget border-2 pt-3 pb-2 px-3 rounded-t-2xl relative overflow-hidden'>
      {isTimerActive && (
        <div
          className='absolute bottom-0 left-0 h-0.5 bg-latte-widget transition-all duration-100 ease-out'
          style={{
            width: `${progress}%`,
          }}
        />
      )}
      <div className='flex items-center justify-between gap-2'>
        <Text.H6M color='latteInputForeground'>
          {action === 'undo'
            ? 'What did Latte get wrong?'
            : 'Did Latte get this right?'}
        </Text.H6M>
        <Button
          variant='ghost'
          size='none'
          onClick={() => onSubmit('')}
          iconProps={{ name: 'close', color: 'latteInputForeground' }}
        />
      </div>
      <div className='flex items-center gap-2'>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Your feedback...'
          className={cn(
            'w-full text-sm text-muted-foreground border-2 border-latte-widget',
            'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none',
          )}
        />
        <Button
          variant='latte'
          onClick={() => onSubmit(value)}
          disabled={value.trim() === ''}
          userSelect={false}
          containerClassName='!rounded-xl'
          className='!rounded-xl !px-2'
          innerClassName='!rounded-xl'
          size='small'
          iconProps={{
            name: action === 'accept' ? 'thumbsUp' : 'thumbsDown',
            color: 'latteInputForeground',
            className: 'flex-shrink-0 stroke-[2.5]',
            placement: 'right',
          }}
          fancy
        />
      </div>
    </div>
  )
}
