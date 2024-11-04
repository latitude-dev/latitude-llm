import { ReactNode } from 'react'

export default function FocusFooter({ content }: { content: ReactNode }) {
  return (
    <div className='flex flex-col items-center justify-center gap-y-6'>
      {content}
    </div>
  )
}
