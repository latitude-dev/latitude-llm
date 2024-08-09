import { ReactNode } from 'react'

import { Button } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default function DocumentWrapper({
  selected,
  params,
  children,
}: {
  selected?: 'logs' | undefined
  params: { documentUuid: string; projectId: string; commitUuid: string }
  children: ReactNode
}) {
  const pathTo = (path: string) =>
    ROUTES.projects
      .detail({ id: Number(params.projectId) })
      .commits.detail({ uuid: params.commitUuid })
      .documents.detail({ uuid: params.documentUuid }).root + path

  return (
    <div className='flex flex-col w-full h-full'>
      <div>
        <div className='flex flex-row p-4 pb-0 gap-4'>
          <Button variant={selected ? 'ghost' : 'secondary'} size='none'>
            <Link href={pathTo('')} className='flex px-4 py-2 gap-2'>
              Editor
            </Link>
          </Button>
          <Button
            variant={selected === 'logs' ? 'secondary' : 'ghost'}
            size='none'
          >
            <Link href={pathTo('/logs')} className='flex px-4 py-2 gap-2'>
              Logs
            </Link>
          </Button>
        </div>
      </div>
      <div className='flex flex-col w-full h-full'>{children}</div>
    </div>
  )
}
