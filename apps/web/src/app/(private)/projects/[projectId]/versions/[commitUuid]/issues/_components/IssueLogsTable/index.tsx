'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
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
import { Span, SpanType } from '@latitude-data/constants'

type Props = {
  spans: Span<SpanType.Prompt>[]
  projectId: number
  commitUuid: string
  documentUuid: string
  showPagination?: boolean
  PaginationFooter?: ReactNode
}

export function IssueSpansTable({
  spans,
  projectId,
  commitUuid,
  documentUuid,
  showPagination,
  PaginationFooter,
}: Props) {
  const { data: commits } = useCommits()
  const handleRowClick = (span: Span<SpanType.Prompt>) => {
    const IssueSpansTable = JSON.stringify({
      traceId: span.traceId,
      spanId: span.id,
    })
    const route = ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: span.commitUuid ?? commitUuid })
      .documents.detail({ uuid: documentUuid }).traces.root

    window.open(
      `${route}?filters=${encodeURIComponent(IssueSpansTable)}`,
      '_blank',
    )
  }
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
          <TableHead>Commit</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {spans.map((span) => (
          <TableRow
            key={span.id}
            onClick={() => handleRowClick(span)}
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
