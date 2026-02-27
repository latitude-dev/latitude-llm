'use client'

import { useAnnotationQueueItems } from '$/stores/annotationQueues/annotationQueueItems'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { timeAgo } from '$/lib/relativeTime'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import {
  ANNOTATION_QUEUE_ITEM_STATUS,
  AnnotationQueueItemStatus,
} from '@latitude-data/constants/annotationQueues'
import { AnnotationQueue } from '@latitude-data/core/schema/models/types/AnnotationQueue'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'

const STATUS_LABELS: Record<AnnotationQueueItemStatus, string> = {
  [ANNOTATION_QUEUE_ITEM_STATUS.pending]: 'Pending',
  [ANNOTATION_QUEUE_ITEM_STATUS.in_progress]: 'In progress',
  [ANNOTATION_QUEUE_ITEM_STATUS.completed]: 'Completed',
}

const STATUS_BADGE_VARIANTS: Record<
  AnnotationQueueItemStatus,
  'warningMuted' | 'accent' | 'successMuted'
> = {
  [ANNOTATION_QUEUE_ITEM_STATUS.pending]: 'warningMuted',
  [ANNOTATION_QUEUE_ITEM_STATUS.in_progress]: 'accent',
  [ANNOTATION_QUEUE_ITEM_STATUS.completed]: 'successMuted',
}

function ItemRowSkeleton() {
  return (
    <TableRow className='border-b-[0.5px] h-12 max-h-12 border-border'>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton height='h5' className='w-20' />
        </TableCell>
      ))}
    </TableRow>
  )
}

export function AnnotationQueueDetail({ queue }: { queue: AnnotationQueue }) {
  const { project } = useCurrentProject()
  const {
    items,
    count,
    hasNext,
    hasPrev,
    isLoading,
    goToNextPage,
    goToPrevPage,
  } = useAnnotationQueueItems({
    projectId: project.id,
    queueId: queue.id,
  })

  const noData = !isLoading && items.length === 0

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-4 min-w-0'>
      <TableWithHeader
        title={
          <div className='flex flex-col gap-1'>
            <Text.H4M noWrap ellipsis>
              {queue.name}
            </Text.H4M>
            {queue.description && (
              <Text.H5 color='foregroundMuted'>{queue.description}</Text.H5>
            )}
          </div>
        }
        table={
          noData ? (
            <TableBlankSlate description='No items in this queue yet.' />
          ) : (
            <Table
              externalFooter={
                <SimpleKeysetTablePaginationFooter
                  hasNext={hasNext}
                  hasPrev={hasPrev}
                  setNext={goToNextPage}
                  setPrev={goToPrevPage}
                  count={count}
                  countLabel={(c) => `${c} ${c === 1 ? 'item' : 'items'}`}
                  isLoading={isLoading}
                />
              }
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Trace</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <ItemRowSkeleton key={i} />
                    ))
                  : items.map((item) => (
                      <TableRow
                        key={item.traceId}
                        className='border-b-[0.5px] h-12 max-h-12 border-border'
                      >
                        <TableCell>
                          <Text.H5 noWrap>{item.traceId}</Text.H5>
                        </TableCell>
                        <TableCell>
                          <Text.H5 noWrap suppressHydrationWarning>
                            {timeAgo({ input: item.createdAt })}
                          </Text.H5>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE_VARIANTS[item.status]}>
                            {STATUS_LABELS[item.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Text.H5 noWrap>
                            {item.completedByUserId || '-'}
                          </Text.H5>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          )
        }
      />
    </div>
  )
}
