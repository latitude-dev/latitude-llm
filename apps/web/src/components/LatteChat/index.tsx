'use client'
import { useLatte } from '$/hooks/latte'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useTypeWriterValue } from '@latitude-data/web-ui/browser'
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { LatteMessageList } from './_components/MessageList'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import type { BotEmotion } from '@latitude-data/web-ui/molecules/DynamicBot'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'

const INPUT_PLACEHOLDERS = [
  'Create a prompt that categorizes tickets based on their content.',
  'Turn this simple chatbot prompt into a multi-step AI agent that first searches the web and then summarizes the results.',
  'Create an AI Agent that automatically responds to support tickets.',
  'Create a workflow that extracts data from PDFs, summarizes it, and stores it in a database.',
  'Make my prompt more effective at extracting key insights from a financial report.',
  'Find why my AI is not performing as expected.',
  'Optimize my prompts cost without sacrificing performance.',
]

export function LatteChat({
  setEmotion,
}: {
  emotion: BotEmotion
  setEmotion: (emotion: BotEmotion) => void
  reactWithEmotion: (emotion: BotEmotion, time?: number) => void
}) {
  const { sendMessage, isLoading, resetChat, interactions, error } = useLatte()

  const inConversation = interactions.length > 0
  const placeholder = useTypeWriterValue(
    inConversation ? [] : INPUT_PLACEHOLDERS,
  )

  useEffect(() => {
    setEmotion(isLoading ? 'thinking' : 'normal')
  }, [isLoading, setEmotion])

  const [value, setValue] = useState('')
  const onSubmit = useCallback(() => {
    if (isLoading) return
    if (value.trim() === '') return
    setValue('')
    sendMessage({ message: value })
  }, [value, sendMessage, isLoading])

  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit()

        // scroll down container
        if (containerRef.current) {
          setTimeout(() => {
            containerRef.current!.scrollTop = containerRef.current!.scrollHeight
          }, 5)
        }
      }
    },
    [onSubmit],
  )

  useAutoScroll(containerRef, {
    startAtBottom: true,
  })

  return (
    <div className='w-full h-full max-h-full flex flex-col items-center'>
      <div className='flex flex-col h-full w-full items-center'>
        <div className='flex-grow min-h-0 h-full w-full flex flex-col items-center justify-center relative'>
          <div
            className='w-full h-full p-4 overflow-hidden custom-scrollbar flex flex-col gap-4 items-center'
            ref={containerRef}
          >
            {!inConversation ? (
              <div className='flex flex-col items-center justify-center h-full gap-4'>
                <Text.H1>Latte</Text.H1>
                <Text.H4 color='foregroundMuted'>Your Latitude copilot</Text.H4>
              </div>
            ) : (
              <>
                <LatteMessageList interactions={interactions} />
                {error && (
                  <div className='w-full max-w-[600px]'>
                    <Alert
                      variant='destructive'
                      direction='column'
                      description={error}
                      cta={
                        <Button variant='outline' onClick={resetChat}>
                          Start a new conversation
                        </Button>
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>
          {inConversation && (
            <div className='absolute top-0 right-0 p-4'>
              <Button
                variant='outline'
                fancy
                iconProps={{
                  name: 'filePlus',
                }}
                onClick={() => {
                  resetChat()
                }}
              >
                New conversation
              </Button>
            </div>
          )}
        </div>
        <div className='p-4 pt-0 max-w-[600px] w-full'>
          <TextArea
            className='bg-transparent w-full px-2 pt-2 pb-14 resize-none text-sm'
            placeholder={inConversation ? 'Ask anything' : placeholder}
            autoGrow
            disabled={isLoading || !!error}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            minRows={2}
            maxRows={5}
          />
        </div>
      </div>
    </div>
  )
}
