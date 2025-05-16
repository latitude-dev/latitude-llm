'use client'
import { useCopilotChat } from '$/stores/copilot/copilotChat'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import {
  useCurrentCommit,
  useCurrentProject,
  useTypeWriterValue,
} from '@latitude-data/web-ui/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { DynamicBot } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Icons/custom-icons'
import { KeyboardEvent, useCallback, useState } from 'react'
import { LatteMessageList } from './MessageList'
import { Suggestions } from './Suggestions'

export function MainPage() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const placeholder = useTypeWriterValue(INPUT_PLACEHOLDERS)
  const [isActive, setIsActive] = useState(false)

  const { sendMessage, isLoading, interactions, suggestions, error } =
    useCopilotChat({
      projectId: project.id,
      commitUuid: commit.uuid,
    })

  const [value, setValue] = useState('')
  const onSubmit = useCallback(() => {
    if (isLoading) return
    if (value.trim() === '') return
    setValue('')
    sendMessage({ message: value })
  }, [value, sendMessage, isLoading])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit()
      }
    },
    [onSubmit],
  )
  const inConversation = interactions.length > 0

  return (
    <div className='w-full h-full max-h-full flex flex-col relative items-center justify-center'>
      <div
        className={cn('flex items-center flex-row w-full p-4', {
          'border-b border-border': inConversation,
        })}
      >
        <div
          className={cn('flex transition-all ease-in-out duration-300', {
            'w-full': !inConversation,
            'w-[0%]': inConversation,
          })}
        />

        <div
          className={cn('flex items-center', {
            'flex-row w-full gap-3': inConversation,
            'flex-col min-w-[400px] gap-2': !inConversation,
          })}
        >
          <div
            className={cn(
              'flex items-center justify-center rounded-full bg-accent relative transition-all ease-in-out duration-300',
              {
                'min-w-12 min-h-12': inConversation,
                'min-w-40 min-h-40': !inConversation,
              },
            )}
          >
            <DynamicBot
              className={inConversation ? 'w-8 h-8' : 'w-24 h-24'}
              color='accentForeground'
              emotion={isLoading ? 'thinking' : isActive ? 'happy' : 'normal'}
              settings={{
                distanceToFollowCursor: inConversation ? Infinity : 350,
                latteMode: true,
              }}
            />
          </div>
          <div className='flex flex-col items-center gap-2'>
            {inConversation ? (
              <Text.H3>Latte</Text.H3>
            ) : (
              <>
                <Text.H1>Latte</Text.H1>
                <Text.H4 color='foregroundMuted'>Code AI in seconds</Text.H4>
              </>
            )}
          </div>
        </div>
        <div
          className={cn('flex w-full transition-all ease-in-out duration-300')}
        />
      </div>
      <div className='w-full flex flex-row h-full'>
        <div className='flex-1 flex flex-col items-center justify-center gap-2 h-full'>
          <div
            className={cn(
              'h-full w-full flex flex-col items-center transition-all ease-in-out duration-300',
              {
                'max-h-[0%] overflow-hidden': !inConversation,
                'max-h-full custom-scrollbar': inConversation,
              },
            )}
          >
            {interactions.length > 0 && (
              <div className='w-full flex flex-col gap-8 max-w-[600px]'>
                <LatteMessageList interactions={interactions} />
                {error && <Text.H5 color='destructive'>{error}</Text.H5>}
              </div>
            )}
          </div>
          <div className='flex w-full max-w-[600px] p-4 pt-0'>
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
              onFocus={() => setIsActive(true)}
              onBlur={() => setIsActive(false)}
            />
          </div>
        </div>
        <Suggestions suggestions={suggestions} />
      </div>
    </div>
  )
}

const INPUT_PLACEHOLDERS = [
  'Create a prompt that categorizes tickets based on their content.',
  'Turn this simple chatbot prompt into a multi-step AI agent that first searches the web and then summarizes the results.',
  'Create an AI Agent that automatically responds to support tickets.',
  'Create a workflow that extracts data from PDFs, summarizes it, and stores it in a database.',
  'Make my prompt more effective at extracting key insights from a financial report.',
  'Find why my AI is not performing as expected.',
  'Optimize my prompts cost without sacrificing performance.',
]
