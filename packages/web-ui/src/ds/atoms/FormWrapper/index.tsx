import { ReactNode } from 'react'

function FormWrapper({ children }: { children: ReactNode }) {
  return <div className='space-y-4'>{children}</div>
}

export { FormWrapper }
