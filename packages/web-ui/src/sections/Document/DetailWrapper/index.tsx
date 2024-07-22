import { ReactNode } from 'react'

export default async function DocumentDetailWrapper({
  children,
}: {
  children: ReactNode
}) {
  return <div className='w-full flex flex-row'>{children}</div>
}
