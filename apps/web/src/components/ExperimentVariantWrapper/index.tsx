import { ReactNode } from 'react'

export function ExperimentVariantWrapper({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className='flex flex-col relative gap-2 p-4 border border-border rounded-md min-w-[300px]'>
      {children}
    </div>
  )
}
