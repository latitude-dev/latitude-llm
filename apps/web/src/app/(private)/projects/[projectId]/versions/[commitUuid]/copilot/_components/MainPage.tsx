'use client'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useTypeWriterValue } from '@latitude-data/web-ui/browser'
import { DynamicBot } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Icons/custom-icons'
import { useState } from 'react'

export function MainPage() {
  const placeholder = useTypeWriterValue(INPUT_PLACEHOLDERS)
  const [isActive, setIsActive] = useState(false)

  return (
    <div className='w-full h-full flex flex-col relative items-center justify-center gap-8'>
      <div className='flex min-w-40 min-h-40 items-center justify-center rounded-full bg-accent relative'>
        <DynamicBot
          className='w-24 h-24'
          color='accentForeground'
          emotion={isActive ? 'happy' : 'normal'}
        />
      </div>
      <div className='flex flex-col items-center gap-2'>
        <Text.H1>Latitude Copilot</Text.H1>
        <Text.H4 color='foregroundMuted'>Code AI in seconds</Text.H4>
      </div>
      <div className='flex w-full max-w-[600px]'>
        <TextArea
          className='w-full resize-none'
          placeholder={placeholder}
          autoGrow
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
        />
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
