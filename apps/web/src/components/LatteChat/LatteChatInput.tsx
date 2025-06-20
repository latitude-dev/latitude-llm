'use client'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useTypeWriterValue } from '@latitude-data/web-ui/browser'
import { KeyboardEvent, useCallback, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'
import { ChangeList } from './_components/ChangesList'
import { LatteChange } from '@latitude-data/constants/latte'
import { Input } from '@latitude-data/web-ui/atoms/Input'

const INPUT_PLACEHOLDERS = [
  'Create a prompt that categorizes tickets based on their content.',
  'Turn this simple chatbot prompt into a multi-step AI agent that first searches the web and then summarizes the results.',
  'Create an AI Agent that automatically responds to support tickets.',
  'Create a workflow that extracts data from PDFs, summarizes it, and stores it in a database.',
  'Make my prompt more effective at extracting key insights from a financial report.',
  'Find why my AI is not performing as expected.',
  'Optimize my prompts cost without sacrificing performance.',
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
  addFeedbackToLatteChange?: (feedback: string) => void
}) {
  const placeholder = useTypeWriterValue(
    inConversation ? [] : INPUT_PLACEHOLDERS,
  )

  const [value, setValue] = useState('')
  const [action, setAction] = useState<'accept' | 'undo'>('accept')
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
    <div className='p-4 pt-0 max-w-[600px] w-full relative flex flex-col gap-0'>
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
          'bg-transparent w-full px-2 pt-2 pb-14 resize-none text-sm',
          {
            'rounded-t-none border-t-0':
              changes.length > 0 || feedbackRequested,
          },
        )}
        placeholder={inConversation ? 'Ask anything' : placeholder}
        autoGrow={value !== ''}
        disabled={isLoading || !!error}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        minRows={2}
        maxRows={value === '' ? 2 : 5} // fixes auto-grow with dynamic placeholder
      />
      <div className='absolute bottom-0 right-0 pb-6 pr-6'>
        <Button
          variant='default'
          onClick={onSubmit}
          disabled={isLoading || !!error || value.trim() === ''}
          fancy
          iconProps={{
            name: 'arrowUp',
            color: 'background',
            placement: 'right',
          }}
        >
          Send
        </Button>
      </div>
      <div className='absolute bottom-0 left-0 pb-6 pl-6'>
        <Button
          variant='outline'
          onClick={resetChat}
          disabled={!inConversation}
          fancy
          iconProps={{
            name: 'addCircle',
            color: 'foregroundMuted',
          }}
        >
          <Text.H5 color='foregroundMuted'>New chat</Text.H5>
        </Button>
      </div>
    </div>
  )
}

function LatteChangesFeedback({
  onSubmit,
  action,
}: {
  onSubmit: (feedback: string) => void
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

  return (
    <div className='flex flex-col gap-2 p-2 border boder-input rounded-t-md'>
      <div className='flex items-center justify-between gap-2'>
        <Text.H6 color='foregroundMuted'>
          {action === 'undo'
            ? 'What did Latte get wrong?'
            : 'Did Latte get this right?'}
        </Text.H6>
        <Button
          variant='ghost'
          onClick={() => onSubmit('')}
          iconProps={{ name: 'close', color: 'foregroundMuted' }}
        />
      </div>
      <div className='flex items-center gap-2'>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Your feedback...'
          className='w-full text-h6'
        />
        <Button
          variant='default'
          onClick={() => {
            onSubmit(value)
          }}
          fancy
          disabled={value.trim() === ''}
        >
          <Text.H6 color='background'>Submit</Text.H6>
        </Button>
      </div>
    </div>
  )
}
