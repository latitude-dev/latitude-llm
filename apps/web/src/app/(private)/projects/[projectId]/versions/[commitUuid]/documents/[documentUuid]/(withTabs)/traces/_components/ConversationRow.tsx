'use client'

import { memo, use } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'
import { timeAgo } from '$/lib/relativeTime'
import { Span } from '@latitude-data/constants'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { ConversationTimeline } from './ConversationTimeline'
import { TraceSpanSelectionActionsContext } from './TraceSpanSelectionContext'
import { useCommits } from '$/stores/commitsStore'
import { CommitVersionCell } from '$/components/CommitVersionCell'
import { EvaluationsColumn } from './EvaluationsColumn'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'

export const TraceRow = memo(function TraceRow({
  span,
  isExpanded,
  toggleRow,
  isRowSelected,
}: {
  span: Span
  isExpanded: boolean
  toggleRow: SelectableRowsHook['toggleRow']
  isRowSelected: boolean
}) {
  const { onClickTraceRow } = use(TraceSpanSelectionActionsContext)
  const { data: commits, isLoading: isLoadingCommits } = useCommits()
  const commit = commits?.find((c) => c.uuid === span.commitUuid)

  const totalTokens =
    (span.tokensPrompt ?? 0) + (span.tokensCompletion ?? 0) || null

  return (
    <>
      <TableRow
        onClick={
          span.documentLogUuid
            ? onClickTraceRow({
                documentLogUuid: span.documentLogUuid,
                spanId: span.id,
                traceId: span.traceId,
              })
            : undefined
        }
        className={cn(
          'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
          {
            'bg-secondary': isExpanded,
          },
        )}
      >
        <TableCell
          preventDefault
          align='left'
          onClick={() => {
            if (span.documentLogUuid) {
              toggleRow(span.documentLogUuid, !isRowSelected)
            }
          }}
        >
          <Checkbox fullWidth={false} checked={isRowSelected} />
        </TableCell>
        <TableCell>
          <Text.H5 noWrap suppressHydrationWarning>
            {timeAgo({ input: span.startedAt })}
          </Text.H5>
        </TableCell>
        <TableCell>
          <CommitVersionCell commit={commit} isLoading={isLoadingCommits} />
        </TableCell>
        <TableCell>
          <Text.H5 noWrap>{span.source ?? '-'}</Text.H5>
        </TableCell>
        <TableCell>
          <Text.H5 noWrap>{formatDuration(span.duration)}</Text.H5>
        </TableCell>
        <TableCell>
          <Text.H5 noWrap>{span.model ?? '-'}</Text.H5>
        </TableCell>
        <TableCell>
          <Text.H5 noWrap>
            {totalTokens !== null ? String(totalTokens) : '-'}
          </Text.H5>
        </TableCell>
        <TableCell>
          <EvaluationsColumn
            spanId={span.id}
            documentLogUuid={span.documentLogUuid}
          />
        </TableCell>
      </TableRow>
      {isExpanded && span.documentLogUuid && (
        <TableRow hoverable={false}>
          <TableCell
            colSpan={999}
            className='max-w-full w-full h-full !p-0'
            innerClassName='w-full h-full flex !justify-center !items-center'
          >
            <ConversationTimeline
              documentLogUuid={span.documentLogUuid}
              commitUuid={span.commitUuid ?? ''}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  )
})
