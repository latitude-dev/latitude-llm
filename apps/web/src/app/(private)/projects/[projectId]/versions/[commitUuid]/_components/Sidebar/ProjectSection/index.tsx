'use client'

import type { Commit, Project } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon, type IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useFeature from '$/stores/useFeature'

type ProjectRoute = { label: string; route: string; iconName: IconName }

function ProjectSectionItem({ item }: { item: ProjectRoute }) {
  const pathname = usePathname()
  const selected = pathname.includes(item.route)
  return (
    <Link
      className={cn('pl-6', {
        'bg-accent': selected,
        'hover:bg-secondary': !selected,
      })}
      href={item.route}
    >
      <div className='flex flex-row items-center h-6 gap-2'>
        <Icon name={item.iconName} color={selected ? 'accentForeground' : 'foreground'} />
        <Text.H5M color={selected ? 'accentForeground' : 'foreground'}>{item.label}</Text.H5M>
      </div>
    </Link>
  )
}

export default function ProjectSection({ project, commit }: { project: Project; commit: Commit }) {
  const feature = useFeature(project.workspaceId, 'latte')
  let PROJECT_ROUTES: ProjectRoute[] = []
  if (feature.isEnabled) {
    PROJECT_ROUTES = [
      {
        label: 'Preview',
        route: ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid })
          .preview.root,
        iconName: 'eye',
      },
      {
        label: 'Analytics',
        route: ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid })
          .overview.root,
        iconName: 'barChart4',
      },
      {
        label: 'History',
        route: ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid })
          .history.root,
        iconName: 'history',
      },
    ]
  } else {
    PROJECT_ROUTES = [
      {
        label: 'Overview',
        route: ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid })
          .overview.root,
        iconName: 'barChart4',
      },
      {
        label: 'History',
        route: ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid })
          .history.root,
        iconName: 'history',
      },
    ]
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='pl-4'>
        <Text.H5M>Project</Text.H5M>
      </div>
      <div className='flex flex-col gap-1'>
        {PROJECT_ROUTES.map((item) => (
          <ProjectSectionItem key={item.route} item={item} />
        ))}
      </div>
    </div>
  )
}
