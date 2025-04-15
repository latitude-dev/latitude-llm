import { KeyboardEvent, useState } from 'react'

import { cn } from '../../../../lib/utils'
import { Button } from '../../../atoms/Button'
import { TextArea } from '../../../atoms/TextArea'
import { Tooltip } from '../../../atoms/Tooltip'
import { TooltipTrigger } from '@radix-ui/react-tooltip'

export function CopilotSection({
  isLoading,
  requestSuggestion,
  disabledMessage,
}: {
  isLoading: boolean
  requestSuggestion: (prompt: string) => void
  disabledMessage?: string
}) {
  const [value, setValue] = useState('')
  const handleSubmit = () => {
    requestSuggestion(value)
  }
  const improveThisPrompt = () => {
    setValue('Improve this prompt')
    requestSuggestion('Improve this prompt')
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className='w-full px-2 pt-2'>
      <div className='flex relative w-full rounded-md'>
        <TextArea
          className={cn(
            'bg-background w-full px-2 pt-2 pb-14 resize-none text-sm',
            {
              'animate-pulse': isLoading,
            },
          )}
          disabled={isLoading || !!disabledMessage}
          placeholder={disabledMessage ?? 'Ask for changes or suggestions!'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          minRows={1}
          maxRows={5}
        />
        <div className='absolute bottom-4 right-4 flex flex-row gap-2 items-center'>
          <Button fancy disabled={isLoading || !value} onClick={handleSubmit}>
            {isLoading ? 'Generating...' : 'Submit'}
          </Button>
          <Tooltip
            trigger={
              <TooltipTrigger asChild>
                <Button
                  iconProps={{ name: 'sparkles', color: 'foregroundMuted' }}
                  variant='outline'
                  fancy
                  onClick={() => improveThisPrompt()}
                  disabled={isLoading}
                >
                  Improve my prompt
                </Button>
              </TooltipTrigger>
            }
          >
            Let our AI Assistant improve and fix your prompt based on
            documentation and best practices.
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
