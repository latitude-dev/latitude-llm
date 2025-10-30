'use client'

import { formatCount } from '$/lib/formatCount'
import { ROUTES } from '$/services/routes'
import { useActiveRunsCount } from '$/stores/runs/activeRuns'
import useFeature from '$/stores/useFeature'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

type ProjectRoute = {
  label: string
  route: string
  iconName: IconName
  notifications?: {
    count: number
    label: (count: number) => string
  }
}

function ProjectSectionItem({ item }: { item: ProjectRoute }) {
  const pathname = usePathname()
  const selected = pathname.includes(item.route)
  return (
    <Link
      className={cn('px-6', {
        'bg-accent': selected,
        'hover:bg-secondary': !selected,
      })}
      href={item.route}
    >
      <div className='w-full flex flex-row items-center justify-between h-6 gap-2'>
        <div className='flex flex-row items-center justify-center gap-2'>
          <Icon
            name={item.iconName}
            color={selected ? 'accentForeground' : 'foreground'}
          />
          <Text.H5M color={selected ? 'accentForeground' : 'foreground'}>
            {item.label}
          </Text.H5M>
        </div>
        {!!item.notifications?.count && (
          <Tooltip
            asChild
            trigger={
              <Badge shape='rounded' variant='noBorderMuted' ellipsis noWrap>
                <div className='flex items-center justify-center gap-1'>
                  <Icon
                    name='loader'
                    color='foregroundMuted'
                    size='small'
                    className='animate-spin'
                  />
                  {formatCount(item.notifications.count)}
                </div>
              </Badge>
            }
            align='center'
            side='right'
            sideOffset={10}
          >
            {item.notifications.label(item.notifications.count)}
          </Tooltip>
        )}
      </div>
    </Link>
  )
}

export default function ProjectSection({
  project,
  commit,
  limitedView,
}: {
  project: Project
  commit: Commit
  limitedView?: boolean
}) {
  const runs = useFeature('runs')
  const issuesFeature = useFeature('issues')

  const disableRunsNotifications = limitedView || !runs.isEnabled
  const { data: active } = useActiveRunsCount({
    project: project,
    realtime: !disableRunsNotifications,
  })

  const PROJECT_ROUTES = useMemo(
    () =>
      [
        {
          label: 'Home',
          route: ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).home.root,
          iconName: 'bot',
        },
        runs.isEnabled && {
          label: 'Runs',
          route: ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).runs.root,
          iconName: 'logs',
          notifications: {
            count: disableRunsNotifications ? 0 : active,
            label: (count: number) =>
              count <= 1
                ? 'There is a run in progress'
                : `There are ${count} runs in progress`,
          },
        },
        issuesFeature.isEnabled && {
          label: 'Issues',
          iconName: 'shieldAlert',
          route: ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).issues.root,
        },
        {
          label: 'Analytics',
          route: ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).analytics.root,
          iconName: 'barChart4',
        },
        {
          label: 'History',
          route: ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid }).history.root,
          iconName: 'history',
        },
      ].filter(Boolean) as ProjectRoute[],
    [
      project,
      commit,
      runs,
      issuesFeature.isEnabled,
      active,
      disableRunsNotifications,
    ],
  )

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
