'use client'
import { useMemo } from 'react'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useIssueHistogram } from '$/stores/issues/histograms/miniStats'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'

function MiniHistogramBar({
  data,
  totalCount,
}: {
  data: Array<{ date: string; count: number }>
  totalCount: number
}) {
  const maxCount = useMemo(() => {
    return Math.max(...data.map((d) => d.count), 1)
  }, [data])

  if (totalCount === 0) {
    return (
      <div className='flex items-center justify-center h-5 w-full'>
        <span className='text-xs text-foregroundMuted'>No events</span>
      </div>
    )
  }

  return (
    <div className='flex items-end gap-[1px] h-5 w-full'>
      {data.map((item, index) => {
        const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0
        return (
          <div
            key={`${item.date}-${index}`}
            className='flex-1 bg-primary rounded-sm'
            style={{
              height: `${Math.max(height, 2)}%`,
              minHeight: item.count > 0 ? '2px' : '0',
            }}
            title={`${item.date}: ${item.count} events`}
          />
        )
      })}
    </div>
  )
}

export function HistogramCell({
  issueId,
  loadingBatch,
}: {
  issueId: number
  loadingBatch: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data, totalCount, isLoading } = useIssueHistogram({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId,
  })

  if (isLoading || loadingBatch) {
    return (
      <div className='flex items-center h-5 w-full'>
        <Skeleton height='h5' className='w-full' />
      </div>
    )
  }

  return <MiniHistogramBar data={data} totalCount={totalCount} />
}
