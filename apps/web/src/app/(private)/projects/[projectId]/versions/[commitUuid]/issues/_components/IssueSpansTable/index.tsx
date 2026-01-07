import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ReactNode } from 'react'
import { useCommits } from '$/stores/commitsStore'
import { Span } from '@latitude-data/constants'

export function IssueSpansTable({
  spans,
  onView,
  showPagination,
  PaginationFooter,
}: {
  spans: Span[]
  showPagination?: boolean
  onView: (span: Span) => () => void
  PaginationFooter?: ReactNode
}) {
  const { data: commits } = useCommits()
  return (
    <Table
      className='table-auto'
      externalFooter={
        showPagination && PaginationFooter ? PaginationFooter : undefined
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {spans.map((span) => (
          <TableRow
            key={span.id}
            onClick={onView(span)}
            className={cn(
              'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
            )}
          >
            <TableCell>
              <Text.H5 noWrap color='foreground'>
                {relativeTime(
                  span.createdAt instanceof Date
                    ? span.createdAt
                    : new Date(span.createdAt),
                )}
              </Text.H5>
            </TableCell>
            <TableCell>
              {(() => {
                const commit = commits.find((c) => c.uuid === span.commitUuid)
                if (!commit) return null

                return (
                  <span className='flex flex-row gap-2 items-center truncate'>
                    <Badge
                      variant={commit.version ? 'accent' : 'muted'}
                      className='flex-shrink-0'
                    >
                      <Text.H6 noWrap>
                        {commit.version ? `v${commit.version}` : 'Draft'}
                      </Text.H6>
                    </Badge>
                    <Text.H5 color='foreground' noWrap ellipsis>
                      {commit.title}
                    </Text.H5>
                  </span>
                )
              })()}
            </TableCell>
            <TableCell>
              <Text.H5 noWrap color='foreground'>
                {formatDuration(span.duration)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Icon name='arrowRight' color='foregroundMuted' />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
