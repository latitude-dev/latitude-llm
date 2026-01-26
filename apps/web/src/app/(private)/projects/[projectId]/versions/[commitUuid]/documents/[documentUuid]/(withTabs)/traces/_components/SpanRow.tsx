'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { EvaluationResultV2, PromptSpan } from '@latitude-data/constants'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { Fragment, memo, useContext, useMemo } from 'react'
import { ConversationTimeline } from './ConversationTimeline'
import { TraceSpanSelectionActionsContext } from './TraceSpanSelectionContext'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useCommits } from '$/stores/commitsStore'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { CommitVersionCell } from '$/components/CommitVersionCell'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'

type SpanRowProps = {
  span: PromptSpan
  toggleRow: ReturnType<typeof useSelectableRows>['toggleRow']
  isRowSelected: boolean
  isExpanded: boolean
  evaluationResults: EvaluationResultV2[]
  isEvaluationResultsLoading: boolean
}

function EvaluationsColumn({
  evaluationResults = [],
  isLoading,
}: {
  evaluationResults?: EvaluationResultV2[]
  isLoading: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { data: evaluations } = useEvaluationsV2({
    project,
    commit,
    document,
  })

  const passedResults = useMemo(
    () => evaluationResults.filter((result) => !!result.hasPassed).length,
    [evaluationResults],
  )

  const pendingResults = useMemo(
    () =>
      evaluations.filter(
        (e) =>
          getEvaluationMetricSpecification(e).supportsManualEvaluation &&
          !evaluationResults.find((r) => r.evaluationUuid === e.uuid),
      ).length,
    [evaluationResults, evaluations],
  )

  if (isLoading) {
    return <Skeleton className='w-full h-4' />
  }

  if (!evaluationResults.length && !pendingResults) {
    return <Text.H5>-</Text.H5>
  }

  return (
    <div className='flex justify-center items-center gap-2 shrink-0'>
      {evaluationResults.length > 0 && (
        <Badge
          variant={
            passedResults >= evaluationResults.length * 0.25
              ? passedResults >= evaluationResults.length * 0.75
                ? 'successMuted'
                : 'warningMuted'
              : 'destructiveMuted'
          }
        >
          <Text.H6>
            {passedResults}/{evaluationResults.length}
          </Text.H6>
        </Badge>
      )}
      {pendingResults > 0 && (
        <Badge variant='muted'>
          <Text.H6>{pendingResults} pending</Text.H6>
        </Badge>
      )}
    </div>
  )
}

export const SpanRow = memo(function SpanRow({
  span,
  toggleRow,
  isRowSelected,
  isExpanded,
  evaluationResults,
  isEvaluationResultsLoading,
}: SpanRowProps) {
  const { onClickTraceRow } = useContext(TraceSpanSelectionActionsContext)
  const { data: commits } = useCommits()
  const commit = commits?.find((c) => c.uuid === span.commitUuid)
  const hasError = span.status === 'error'
  const textColor = hasError ? 'destructive' : 'foreground'
  if (!commit) return null

  return (
    <Fragment>
      <TableRow
        onClick={onClickTraceRow({
          type: 'trace',
          data: { documentLogUuid: span.documentLogUuid, spanId: span.id },
        })}
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
            toggleRow(span.id, !isRowSelected)
          }}
        >
          <Checkbox fullWidth={false} checked={isRowSelected} />
        </TableCell>
        <TableCell>
          <Text.H5 noWrap color={textColor}>
            {relativeTime(
              span.startedAt instanceof Date
                ? span.startedAt
                : new Date(span.startedAt),
            )}
          </Text.H5>
        </TableCell>
        <TableCell>
          <CommitVersionCell commit={commit} textColor={textColor} />
        </TableCell>
        <TableCell>
          <Text.H5 noWrap color={textColor}>
            {span.source ?? '-'}
          </Text.H5>
        </TableCell>
        <TableCell>
          <Text.H5 noWrap color={textColor}>
            {formatDuration(span.duration)}
          </Text.H5>
        </TableCell>
        <TableCell>
          <EvaluationsColumn
            evaluationResults={evaluationResults}
            isLoading={isEvaluationResultsLoading}
          />
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow hoverable={false}>
          <TableCell
            colSpan={999}
            className='max-w-full w-full h-full !p-0'
            innerClassName='w-full h-full flex !justify-center !items-center'
          >
            <ConversationTimeline documentLogUuid={span.documentLogUuid} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
})
