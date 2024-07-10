import { ReactNode } from 'react'

export default function FocusLayout({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <div className='flex flex-col items-center justify-center h-screen'>
      <div className='flex flex-col gap-y-6 max-w-80'>
        <div>{header}</div>
        {children}
      </div>
    </div>
  )
}
