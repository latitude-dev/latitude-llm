'use client'

import { memo, useContext } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'
import { timeAgo } from '$/lib/relativeTime'
import { Conversation } from '$/stores/conversations'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { ConversationTimeline } from './ConversationTimeline'
import { TraceSpanSelectionActionsContext } from './TraceSpanSelectionContext'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useCommits } from '$/stores/commitsStore'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { CommitVersionCell } from '$/components/CommitVersionCell'
import { EvaluationsColumn } from './EvaluationsColumn'

export const ConversationRow = memo(function ConversationRow({
  conversation,
  toggleRow,
  isRowSelected,
  isExpanded,
}: {
  conversation: Conversation
  toggleRow: ReturnType<typeof useSelectableRows>['toggleRow']
  isRowSelected: boolean
  isExpanded: boolean
}) {
  const { onClickConversationRow } = useContext(
    TraceSpanSelectionActionsContext,
  )
  const { data: commits, isLoading: isLoadingCommits } = useCommits()
  const commit = commits?.find((c) => c.uuid === conversation.commitUuid)

  return (
    <>
      <TableRow
        onClick={onClickConversationRow(conversation)}
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
            toggleRow(conversation.documentLogUuid!, !isRowSelected)
          }}
        >
          <Checkbox fullWidth={false} checked={isRowSelected} />
        </TableCell>
        <TableCell>
          <Text.H5 noWrap suppressHydrationWarning>
            {timeAgo({ input: conversation.startedAt })}
          </Text.H5>
        </TableCell>
        <TableCell>
          <CommitVersionCell commit={commit} isLoading={isLoadingCommits} />
        </TableCell>
        <TableCell>
          <Text.H5 noWrap>{conversation.source ?? '-'}</Text.H5>
        </TableCell>
        <TableCell>
          <Text.H5 noWrap>{formatDuration(conversation.totalDuration)}</Text.H5>
        </TableCell>
        <TableCell>
          <EvaluationsColumn conversationId={conversation.documentLogUuid} />
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow hoverable={false}>
          <TableCell
            colSpan={999}
            className='max-w-full w-full h-full !p-0'
            innerClassName='w-full h-full flex !justify-center !items-center'
          >
            <ConversationTimeline
              documentLogUuid={conversation.documentLogUuid!}
              commitUuid={conversation.commitUuid}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  )
})
