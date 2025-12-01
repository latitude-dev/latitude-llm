'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { EvaluationResultV2, Span, SpanType } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { Fragment, use, useMemo } from 'react'
import { Trace } from './Trace'
import { TraceSpanSelectionContext } from './TraceSpanSelectionContext'
import { useCommits } from '$/stores/commitsStore'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { getEvaluationMetricSpecification } from '$/components/evaluations'

type SpanRowProps = {
  span: Span<SpanType.Prompt>
  toggleRow: ReturnType<typeof useSelectableRows>['toggleRow']
  isSelected: ReturnType<typeof useSelectableRows>['isSelected']
  isExpanded: boolean
  evaluationResults?: EvaluationResultV2[]
  isEvaluationResultsLoading?: boolean
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

export function SpanRow({
  span,
  toggleRow,
  isSelected,
  isExpanded,
  evaluationResults = [],
  isEvaluationResultsLoading = false,
}: SpanRowProps) {
  const { onClickTraceRow } = use(TraceSpanSelectionContext)
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
          data: { traceId: span.traceId, spanId: span.id },
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
            toggleRow(span.id, !isSelected(span.id))
          }}
        >
          <Checkbox fullWidth={false} checked={isSelected(span.id)} />
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
          <div className='flex flex-row gap-1 items-center truncate'>
            <Badge
              variant={commit.version ? 'accent' : 'muted'}
              className='flex-shrink-0'
            >
              <Text.H6 noWrap>
                {commit.version ? `v${commit.version}` : 'Draft'}
              </Text.H6>
            </Badge>
            <Text.H5 noWrap ellipsis color={textColor}>
              {commit.title}
            </Text.H5>
          </div>
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
            <Trace traceId={span.traceId} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}
