import type { ReactNode } from 'react'

export default function FocusLayout({
  header,
  footer,
  banner,
  children,
}: {
  header?: ReactNode
  footer?: ReactNode
  banner?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className='flex flex-col h-screen'>
      {banner}
      <div className='flex flex-1 flex-col items-center justify-center min-h-0'>
        <div className='flex flex-col gap-y-6 max-w-[22rem]'>
          {header ? <div>{header}</div> : null}
          {children}
          {footer && (
            <div className='flex flex-col items-center justify-center gap-y-6'>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
