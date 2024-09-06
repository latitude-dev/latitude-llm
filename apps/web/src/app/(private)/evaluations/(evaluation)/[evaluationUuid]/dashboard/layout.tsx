import { ReactNode } from 'react'

import { Text } from '@latitude-data/web-ui'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className='w-full h-[600px] flex flex-col items-center justify-center'>
        <Text.H4>(Really cool dashboard)</Text.H4>
      </div>
    </>
  )
}
