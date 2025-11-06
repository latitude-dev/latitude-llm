'use client'

import { RefObject, useRef, useState } from 'react'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import { DetailsPanel } from '$/components/DetailsPannel'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import {
  useIssueEvaluationResults,
  IssueEvaluationResult,
} from '$/stores/issues/evaluationResults'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { LimitedTablePaginationFooter } from '$/components/TablePaginationFooter/LimitedTablePaginationFooter'
import { cn } from '@latitude-data/web-ui/utils'
import {
  IssueEvaluationResultsTable,
  ExpandedResultView,
} from '../IssueEvaluationResultsTable'

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
  const [expandedResult, setExpandedResult] =
    useState<IssueEvaluationResult | null>(null)

  const [page, setPage] = useState(1)
  const {
    data: results,
    hasNextPage,
    isLoading,
  } = useIssueEvaluationResults({
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

  const showDetails = expandedResult !== null
  return (
    <DetailsPanel ref={ref}>
      <DetailsPanel.Header>
        <div className='flex flex-col gap-y-1'>
          <Text.H4>{issue.title}</Text.H4>
          <Text.H5 color='foregroundMuted'>{issue.description}</Text.H5>
        </div>
      </DetailsPanel.Header>
      <DetailsPanel.Body>
        <div className='relative w-full overflow-hidden'>
          {/* === SLIDING CONTENT WRAPPER === */}
          <div
            className={cn(
              'grid grid-cols-2 w-[200%]',
              'transition-transform duration-300',
              {
                '-translate-x-1/2': showDetails,
              },
            )}
          >
            {/* === TABLE SCREEN === */}
            <div
              className={cn(
                'relative w-full transition-opacity duration-300',
                'flex flex-col gap-y-4',
                {
                  'opacity-0': showDetails,
                  'opacity-100': !showDetails,
                },
              )}
            >
              <Text.H5M>Evaluation results</Text.H5M>
              {isLoading ? (
                <div className='flex flex-col gap-y-2'>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} height='h5' className='w-full' />
                  ))}
                </div>
              ) : results.length > 0 ? (
                <IssueEvaluationResultsTable
                  results={results}
                  onView={setExpandedResult}
                  showPagination
                  page={page}
                  hasNextPage={hasNextPage}
                  PaginationFooter={
                    <LimitedTablePaginationFooter
                      page={page}
                      nextPage={hasNextPage}
                      onPageChange={setPage}
                    />
                  }
                />
              ) : null}
            </div>

            {/* === DETAILS SCREEN === */}
            <div
              className={cn(
                'relative w-full transition-opacity duration-300',
                'flex flex-col gap-y-4',
                {
                  'opacity-0': !showDetails,
                  'opacity-100': showDetails,
                },
              )}
            >
              <div>
                <Button
                  variant='ghost'
                  size='none'
                  iconProps={{ name: 'chevronLeft' }}
                  onClick={() => setExpandedResult(null)}
                >
                  Back to list
                </Button>
              </div>
              {expandedResult && <ExpandedResultView result={expandedResult} />}
            </div>
          </div>
        </div>
      </DetailsPanel.Body>
    </DetailsPanel>
  )
}
