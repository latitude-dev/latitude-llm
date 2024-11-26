'use client'

import { Commit, Project } from '@latitude-data/core/browser'
import { cn, Icon, Text } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function ProjectSection({
  project,
  commit,
}: {
  project: Project
  commit: Commit
}) {
  const pathname = usePathname()
  const selected = pathname.includes(
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid }).overview.root,
  )

  return (
    <div className='flex flex-col gap-2'>
      <div className='pl-4'>
        <Text.H5>Project</Text.H5>
      </div>
      <Link
        className={cn('pl-6', {
          'bg-accent': selected,
        })}
        href={
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).overview.root
        }
      >
        <Text.H5M color={selected ? 'accentForeground' : 'foreground'}>
          <div className='flex flex-row items-center gap-2'>
            <Icon name='folderOpen' />
            Overview
          </div>
        </Text.H5M>
      </Link>
    </div>
  )
}
