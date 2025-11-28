'use client'

import { formatCount } from '$/lib/formatCount'
import { ROUTES } from '$/services/routes'
import { ActiveRunsCountContext } from '../../ActiveRunsCountProvider'

import { LogSources, RunSourceGroup } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { use, useMemo } from 'react'

function sumCounts(counts: Record<LogSources, number> | undefined): number {
  if (!counts) return 0
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

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
  const disableRunsNotifications = !!limitedView
  const { data: activeCountBySource } = use(ActiveRunsCountContext)

  const activeCount = useMemo(
    () => sumCounts(activeCountBySource),
    [activeCountBySource],
  )

  const { value: lastRunTab } = useLocalStorage<RunSourceGroup>({
    key: AppLocalStorage.lastRunTab,
    defaultValue: RunSourceGroup.Playground,
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
        {
          label: 'Runs',
          route: ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .runs.root({ sourceGroup: lastRunTab }),
          iconName: 'logs',
          notifications: {
            count: disableRunsNotifications ? 0 : activeCount,
            label: (count: number) =>
              count <= 1
                ? 'There is a run in progress'
                : `There are ${count} runs in progress`,
          },
        },
        {
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
    [project, commit, activeCount, disableRunsNotifications, lastRunTab],
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
