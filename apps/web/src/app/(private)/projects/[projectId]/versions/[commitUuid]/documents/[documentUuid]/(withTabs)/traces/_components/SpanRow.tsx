'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { Span, SpanType } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { Fragment } from 'react'
import { Trace } from './Trace'
import { useTraceSpanSelection } from './TraceSpanSelectionContext'
import { useCommits } from '$/stores/commitsStore'

type SpanRowProps = {
  span: Span<SpanType.Prompt>
  isSelected: boolean
}

export function SpanRow({ span, isSelected }: SpanRowProps) {
  const { selectTraceSpan } = useTraceSpanSelection()
  const { data: commits } = useCommits()
  const commit = commits?.find((c) => c.uuid === span.commitUuid)
  if (!commit) return null

  return (
    <Fragment>
      <TableRow
        onClick={() => selectTraceSpan(span.traceId, span.id)}
        className={cn(
          'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
          {
            'bg-secondary': isSelected,
          },
        )}
      >
        <TableCell>
          <Text.H5 noWrap>
            {relativeTime(
              span.startedAt instanceof Date
                ? span.startedAt
                : new Date(span.startedAt),
            )}
          </Text.H5>
        </TableCell>
        <TableCell>
          <div className='flex flex-row gap-1 items-center truncate'>
            <Badge
              variant={commit.version ? 'accent' : 'muted'}
              className='flex-shrink-0'
            >
              <Text.H6 noWrap>
                {commit.version ? `v${commit.version}` : 'Draft'}
              </Text.H6>
            </Badge>
            <Text.H5 noWrap ellipsis>
              {commit.title}
            </Text.H5>
          </div>
        </TableCell>
        <TableCell>
          <Text.H5 noWrap>{formatDuration(span.duration)}</Text.H5>
        </TableCell>
        <TableCell>
          <Badge
            variant={
              span.status === 'ok'
                ? 'successMuted'
                : span.status === 'error'
                  ? 'destructiveMuted'
                  : 'muted'
            }
          >
            {span.status === 'ok' ? 'Succeeded' : 'Failed'}
          </Badge>
        </TableCell>
      </TableRow>
      {isSelected && (
        <TableRow hoverable={false}>
          <TableCell
            colSpan={999}
            className='max-w-full w-full h-full !p-0'
            innerClassName='w-full h-full flex !justify-center !items-center'
          >
            <Trace traceId={span.traceId} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}
