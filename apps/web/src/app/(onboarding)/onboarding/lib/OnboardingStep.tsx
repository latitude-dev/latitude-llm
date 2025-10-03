import { ReactNode } from 'react'

export function OnboardingStep({
  iconAndTitle,
  content,
}: {
  iconAndTitle: ReactNode
  content: ReactNode
}) {
  return (
    <div className='flex flex-col h-full items-center p-16 gap-10'>
      <div className='flex flex-col items-center gap-2'>{iconAndTitle}</div>
      {content}
    </div>
  )
}
