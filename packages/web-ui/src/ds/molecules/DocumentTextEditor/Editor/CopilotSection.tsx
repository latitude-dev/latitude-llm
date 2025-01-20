import { KeyboardEvent, useEffect, useMemo, useState } from 'react'

import { cn } from '../../../../lib/utils'
import { Button, Text, TextArea } from '../../../atoms'
import {
  DynamicBot,
  useDynamicBotEmotion,
} from '../../../atoms/Icons/custom-icons'
import { DiffOptions } from '../types'

export function CopilotSection({
  isLoading,
  requestSuggestion,
  disabledMessage,
  suggestion,
  handleApplySuggestion,
  handleRejectSuggestion,
}: {
  isLoading: boolean
  requestSuggestion?: (prompt: string) => void
  disabledMessage?: string
  suggestion?: DiffOptions
  handleApplySuggestion?: () => void
  handleRejectSuggestion?: () => void
}) {
  const [value, setValue] = useState('')
  const handleSubmit = () => {
    requestSuggestion?.(value)
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const { emotion, setEmotion, reactWithEmotion } = useDynamicBotEmotion({
    emotion: 'normal',
  })

  const currentEmotion = useMemo(() => {
    if (isLoading) return 'thinking'
    if (suggestion) return 'happy'
    return 'normal'
  }, [isLoading, suggestion])

  useEffect(() => setEmotion(currentEmotion), [currentEmotion])

  return (
    <div className={cn('w-full px-2 pt-2', { 'animate-pulse': isLoading })}>
      <div className='flex relative w-full rounded-md'>
        <div className='absolute -top-[19px] left-2 w-10 h-10 pointer-events-none'>
          <div
            className='absolute w-full h-full bg-background rounded-full border border-border z-10'
            style={{ clipPath: 'inset(0 0 50% 0)' }}
          />
          <div className='absolute w-full h-full flex items-center justify-center pb-2 z-20'>
            <DynamicBot size='24' emotion={emotion} color='foregroundMuted' />
          </div>
        </div>
        {suggestion ? (
          <div className='flex flex-col w-full items-center gap-2 bg-background border border-border rounded-md p-2'>
            {suggestion.description && (
              <div className='w-full max-h-24 overflow-y-auto custom-scrollbar px-2'>
                <Text.H5 color='foregroundMuted'>
                  {suggestion.description}
                </Text.H5>
              </div>
            )}
            <div className='flex flex-row gap-2 w-full justify-end'>
              <Button
                variant='outline'
                fancy
                onClick={() => {
                  handleRejectSuggestion?.()
                  reactWithEmotion('unhappy')
                }}
                onMouseEnter={() => setEmotion('unhappy')}
                onMouseLeave={() => setEmotion(currentEmotion)}
              >
                Discard
              </Button>
              <Button
                onClick={() => {
                  setValue('')
                  handleApplySuggestion?.()
                  reactWithEmotion('happy')
                }}
                fancy
              >
                Apply
              </Button>
            </div>
          </div>
        ) : (
          <>
            <TextArea
              onFocus={() => setEmotion('happy')}
              onBlur={() => setEmotion('normal')}
              className='bg-background w-full px-2 pt-2 pb-14 resize-none text-sm'
              disabled={isLoading || !!disabledMessage}
              placeholder={disabledMessage ?? 'Ask for changes or suggestions!'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              minRows={1}
              maxRows={5}
            />
            <div className='absolute bottom-4 right-4 flex flex-row gap-2 items-center'>
              <Button
                fancy
                disabled={isLoading || !value}
                onClick={handleSubmit}
              >
                {isLoading ? 'Thinking...' : 'Submit'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
