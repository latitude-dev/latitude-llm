import { ReactNode } from 'react'
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
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { relativeTime } from '$/lib/relativeTime'
import ResultBadge from '$/components/evaluations/ResultBadge'
import { IssueEvaluationResult } from '$/stores/issues/evaluationResults'
import { EvaluationMetric, EvaluationType } from '@latitude-data/constants'
import { cn } from '@latitude-data/web-ui/utils'
import {
  ResultPanelLoading,
  ResultPanelMetadata,
} from '$/components/evaluations/ResultPanel'
import useDocumentLog from '$/stores/documentLogWithMetadata'
import { useRef } from 'react'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'

function isClickable<T extends EvaluationType, M extends EvaluationMetric<T>>({
  result,
  evaluation,
}: {
  result: ResultWithEvaluationV2<T, M>['result']
  evaluation: ResultWithEvaluationV2<T, M>['evaluation']
}): boolean {
  if (result.error) return false

  const specification = getEvaluationMetricSpecification(evaluation)
  return !!specification.resultReason(result as any)
}

export function ExpandedResultView({
  result,
}: {
  result: IssueEvaluationResult
}) {
  const {
    data: evaluatedDocumentLog,
    isLoading: isLoadingEvaluatedDocumentLog,
  } = useDocumentLog({
    documentLogUuid: result.evaluatedLog.documentLogUuid ?? undefined,
  })

  const panelRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  if (isLoadingEvaluatedDocumentLog) return <ResultPanelLoading />

  return (
    <div className='flex flex-col gap-4'>
      {evaluatedDocumentLog ? (
        <ResultPanelMetadata
          evaluation={result.evaluation}
          result={result}
          commit={result.commit}
          evaluatedProviderLog={result.evaluatedLog}
          evaluatedDocumentLog={evaluatedDocumentLog}
          panelRef={panelRef}
          tableRef={tableRef}
          selectedTab='metadata'
        />
      ) : null}
    </div>
  )
}

export function IssueEvaluationResultsTable({
  results,
  showPagination = false,
  PaginationFooter,
  onView,
}: {
  results: IssueEvaluationResult[]
  showPagination?: boolean
  PaginationFooter?: ReactNode
  page?: number
  hasNextPage?: boolean
  onView?: (result: IssueEvaluationResult) => void
}) {
  return (
    <div className='flex flex-col gap-y-4'>
      <Table
        className='w-full table-fixed'
        externalFooter={
          showPagination && PaginationFooter ? PaginationFooter : undefined
        }
      >
        <TableHeader className='sticky top-0 z-10'>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className='max-h-full overflow-y-auto'>
          {results.map((result) => {
            const clickable = isClickable({
              result: result,
              evaluation: result.evaluation,
            })
            return (
              <TableRow
                key={result.uuid}
                onClick={() => {
                  if (clickable && onView) {
                    onView(result)
                  }
                }}
                className={cn('border-b-[0.5px] h-12 max-h-12 border-border', {
                  'cursor-pointer hover:bg-secondary/50': clickable,
                })}
              >
                <TableCell>
                  <Text.H5 noWrap>
                    <time dateTime={new Date(result.createdAt).toISOString()}>
                      {relativeTime(new Date(result.createdAt))}
                    </time>
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <span className='flex flex-row gap-2 items-center overflow-hidden'>
                    <Badge variant={result.commit.version ? 'accent' : 'muted'}>
                      <Text.H6 noWrap>
                        {result.commit.version
                          ? `v${result.commit.version}`
                          : 'Draft'}
                      </Text.H6>
                    </Badge>
                    <Text.H5 noWrap ellipsis>
                      {result.commit.title}
                    </Text.H5>
                  </span>
                </TableCell>
                <TableCell>
                  <ResultBadge evaluation={result.evaluation} result={result} />
                </TableCell>
                <TableCell>
                  {clickable ? (
                    <Button
                      variant='outline'
                      size='small'
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onView) {
                          onView(result)
                        }
                      }}
                    >
                      View
                    </Button>
                  ) : (
                    <Text.H5 color='foregroundMuted'>-</Text.H5>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
