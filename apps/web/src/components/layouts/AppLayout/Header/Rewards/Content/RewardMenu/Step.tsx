import type { ReactNode } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'

export function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <div className='flex flex-row w-full items-start gap-2'>
      <Badge variant='default'>{number}</Badge>
      <div className='w-full flex flex-col gap-2'>{children}</div>
    </div>
  )
}
