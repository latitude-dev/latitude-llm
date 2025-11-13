'use client'

import { RefObject, useRef, useState } from 'react'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import { DetailsPanel } from '$/components/DetailsPannel'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useIssueLogs } from '$/stores/issues/logs'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { LimitedTablePaginationFooter } from '$/components/TablePaginationFooter/LimitedTablePaginationFooter'
import { IssueLogsTable } from '../IssueLogsTable'

const PAGE_SIZE = 25
export function IssuesDetailPanel({
  stickyRef,
  issue,
  containerRef,
  offset,
}: {
  issue: Issue
  stickyRef?: RefObject<HTMLTableElement | null>
  containerRef?: RefObject<HTMLDivElement | null>
  offset: StickyOffset
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const [page, setPage] = useState(1)
  const {
    data: logs,
    hasNextPage,
    isLoading,
  } = useIssueLogs({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId: issue.id,
    page,
    pageSize: PAGE_SIZE,
  })

  const scrollableArea = usePanelDomRef({ selfRef: ref.current })
  const beacon = stickyRef?.current
  useStickyNested({
    scrollableArea,
    beacon,
    target: ref.current,
    targetContainer: containerRef?.current,
    offset: offset ?? { top: 0, bottom: 0 },
  })

  return (
    <DetailsPanel ref={ref}>
      <DetailsPanel.Header>
        <div className='flex flex-col gap-y-1'>
          <Text.H4>{issue.title}</Text.H4>
          <Text.H5 color='foregroundMuted'>{issue.description}</Text.H5>
        </div>
      </DetailsPanel.Header>
      <DetailsPanel.Body>
        <div className='flex flex-col gap-y-4'>
          <Text.H5M>Issue logs</Text.H5M>
          {isLoading ? (
            <div className='flex flex-col gap-y-2'>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height='h5' className='w-full' />
              ))}
            </div>
          ) : logs.length > 0 ? (
            <IssueLogsTable
              logs={logs}
              projectId={project.id}
              commitUuid={commit.uuid}
              documentUuid={issue.documentUuid}
              showPagination
              PaginationFooter={
                <LimitedTablePaginationFooter
                  page={page}
                  nextPage={hasNextPage}
                  onPageChange={setPage}
                />
              }
            />
          ) : (
            <Text.H5 color='foregroundMuted'>
              No logs found for this issue
            </Text.H5>
          )}
        </div>
      </DetailsPanel.Body>
    </DetailsPanel>
  )
}
