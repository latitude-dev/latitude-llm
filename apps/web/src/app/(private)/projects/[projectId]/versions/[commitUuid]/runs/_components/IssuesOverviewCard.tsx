'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ROUTES } from '$/services/routes'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { IssuesOverviewResponse } from '$/app/api/projects/[projectId]/issues/overview/route'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function IssuesOverviewCard() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const router = useRouter()

  const { data, isLoading } = useSWR<IssuesOverviewResponse>(
    `/api/projects/${project.id}/issues/overview`,
    fetcher,
  )

  if (isLoading || !data) return null
  if (data.totalAnnotations === 0) return null

  const progress = data.totalAnnotations > 0
    ? (data.issuesWithAnnotations / data.totalAnnotations) * 100
    : 0

  const handleReviewIssues = () => {
    router.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .issues.root,
    )
  }

  return (
    <div className='w-full p-6 border border-border rounded-xl bg-background'>
      <div className='flex items-start justify-between mb-6'>
        <div>
          <Text.H4>Issues overview is now available!</Text.H4>
          <Text.H6 color='foregroundMuted'>
            Keep annotating to discover more issues.
          </Text.H6>
        </div>
        <Button
          variant='outline'
          size='small'
          onClick={handleReviewIssues}
          fancy
        >
          Review issues
          <Icon name='chevronRight' />
        </Button>
      </div>

      <div className='flex items-center gap-4'>
        <div className='flex-1 relative'>
          {/* Background bar */}
          <div className='h-2 w-full bg-muted rounded-full overflow-hidden'>
            {/* Progress bar */}
            <div
              className='h-full bg-primary transition-all duration-300'
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Lightbulb icon */}
        <div className='flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center relative'>
          <div className='absolute -top-1 left-1/2 -translate-x-1/2 text-yellow-500'>
            <Icon name='sparkles' className='w-3 h-3' />
          </div>
          <Icon name='lightBulb' className='text-yellow-500 w-5 h-5' />
        </div>

        <div className='flex-1 h-2 bg-muted rounded-full' />
      </div>

      <div className='flex items-center justify-between mt-3'>
        <div className='flex items-center gap-2'>
          <Text.H6 color='foregroundMuted'>Insight discovery ·</Text.H6>
          <Text.H6>{data.issuesWithAnnotations}</Text.H6>
        </div>
        <Text.H6 color='foregroundMuted'>{data.totalAnnotations}</Text.H6>
      </div>
    </div>
  )
}
