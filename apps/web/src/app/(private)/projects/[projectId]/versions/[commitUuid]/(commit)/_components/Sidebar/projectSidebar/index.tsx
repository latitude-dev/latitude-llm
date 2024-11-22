'use client'

import {
  cn,
  Icon,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function ProjectSidebar() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const pathname = usePathname()
  const selected =
    pathname ===
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid }).traces.root

  return (
    <div className='flex flex-col gap-2'>
      <div className='ml-4'>
        <Text.H5M>Project</Text.H5M>
      </div>
      <div
        className={cn('flex flex-row gap-2 items-center pl-6', {
          'bg-accent': selected,
        })}
      >
        <Icon name='logs' color={selected ? 'primary' : 'foreground'} />
        <Link
          href={
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid }).traces.root
          }
        >
          <Text.H5M color={selected ? 'primary' : 'foreground'}>
            Traces
          </Text.H5M>
        </Link>
      </div>
    </div>
  )
}
