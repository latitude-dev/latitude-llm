import type { ReactNode } from 'react'

export default function FocusLayout({
  header,
  footer,
  children,
}: {
  header: ReactNode
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className='flex flex-col items-center justify-center h-screen'>
      <div className='flex flex-col gap-y-8 max-w-[22rem]'>
        <div>{header}</div>
        {children}
        {footer && (
          <div className='flex flex-col items-center justify-center gap-y-6'>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
