import { KeyboardEvent, useState } from 'react'

import { cn } from '../../../../lib/utils'
import { Button, TextArea } from '../../../atoms'

export function CopilotSection({
  isLoading,
  requestSuggestion,
}: {
  isLoading: boolean
  requestSuggestion: (prompt: string) => void
}) {
  const [value, setValue] = useState('')
  const handleSubmit = () => {
    requestSuggestion(value)
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
          disabled={isLoading}
          placeholder='Ask for changes or suggestions!'
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
        </div>
      </div>
    </div>
  )
}
