'use client'

import { TriggersSection } from './Triggers'
import { MainAgent } from './Agent'
import { RunProps } from '$/components/Agent/types'

function Spring() {
  // Using 'justify-center' does center the content, but fails to overflow correctly.
  // Using 'justify-start' but centering it with springs works.
  return <div className='flex-grow min-h-0' />
}

export function MainAgentSection({
  runPromptFn,
}: {
  runPromptFn: (props: RunProps) => void
}) {
  return (
    <div className='flex flex-col items-center relative h-full custom-scrollbar py-[72px] px-8 w-full'>
      <Spring />

      <div className='flex flex-col items-center gap-20 w-full'>
        <MainAgent runPromptFn={runPromptFn} />

        <div className='w-px h-16 bg-border flex-shrink-0' />

        <TriggersSection runPromptFn={runPromptFn} />
      </div>

      <Spring />
    </div>
  )
}
