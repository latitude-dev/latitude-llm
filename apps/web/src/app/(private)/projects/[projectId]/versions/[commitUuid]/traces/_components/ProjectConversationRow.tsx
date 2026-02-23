'use client'

import { memo, use } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'
import { timeAgo } from '$/lib/relativeTime'
import { useCommits } from '$/stores/commitsStore'
import { useConversationEvaluations } from '$/stores/conversations/useConversation'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { CommitVersionCell } from '$/components/CommitVersionCell'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Span } from '@latitude-data/constants'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { ConversationTimeline } from '$/components/traces/ConversationTimeline'
import { TraceSpanSelectionActionsContext } from '$/components/traces/TraceSpanSelectionContext'

function EvaluationsColumn({ conversationId }: { conversationId: string }) {
  const { results, isLoading } = useConversationEvaluations({
    conversationId,
    enabled: true,
  })

  if (isLoading) {
    return <Skeleton className='w-full h-4' />
  }

  if (!results.length) {
    return <Text.H5>-</Text.H5>
  }

  const passedResults = results.filter((result) => !!result.result.hasPassed)

  return (
    <Badge variant='muted'>
      <Text.H6>
        {passedResults.length}/{results.length}
      </Text.H6>
    </Badge>
  )
}

export const ProjectConversationRow = memo(function ProjectConversationRow({
  span,
  documentLabel,
  isSelected,
}: {
  span: Span
  documentLabel: string
  isSelected: boolean
}) {
  const { onClickTraceRow } = use(TraceSpanSelectionActionsContext)
  const { data: commits, isLoading: isLoadingCommits } = useCommits()
  const commit = commits?.find((c) => c.uuid === span.commitUuid)

  return (
    <>
      <TableRow
        onClick={
          span.documentLogUuid
            ? onClickTraceRow({ documentLogUuid: span.documentLogUuid })
            : undefined
        }
        className={cn(
          'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
          {
            'bg-secondary': isSelected,
          },
        )}
      >
        <TableCell>
          <Text.H5 noWrap suppressHydrationWarning>
            {timeAgo({ input: span.startedAt })}
          </Text.H5>
        </TableCell>
        <TableCell className='max-w-64'>
          <Text.H5 noWrap ellipsis>
            {documentLabel}
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
          {span.documentLogUuid ? (
            <EvaluationsColumn conversationId={span.documentLogUuid} />
          ) : (
            <Text.H5>-</Text.H5>
          )}
        </TableCell>
      </TableRow>
      {isSelected && span.documentLogUuid && (
        <TableRow hoverable={false}>
          <TableCell
            colSpan={999}
            className='max-w-full w-full h-full !p-0'
            innerClassName='w-full h-full flex !justify-center !items-center'
          >
            <ConversationTimeline
              documentLogUuid={span.documentLogUuid}
              commitUuid={span.commitUuid ?? ''}
              documentUuid={span.documentUuid}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  )
})
