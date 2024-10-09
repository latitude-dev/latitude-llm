'use client'

import { Dispatch, SetStateAction } from 'react'
import { capitalize } from 'lodash-es'

import {
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  cn,
  RangeBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { relativeTime } from '$/app/_lib/formatUtils'
import { LogicTablePaginationFooter } from '$/components/TablePaginationFooter/LogicTablePaginationFooter'

export const ResultCellContent = ({
  evaluation,
  value,
}: {
  evaluation: EvaluationDto
  value: unknown
}) => {
  if (evaluation.configuration.type === EvaluationResultableType.Boolean) {
    return (
      <Text.H4 color={(value as boolean) ? 'success' : 'destructive'}>
        {String(value)}
      </Text.H4>
    )
  }

  if (evaluation.configuration.type === EvaluationResultableType.Number) {
    const minValue = evaluation.configuration.detail?.range.from ?? 0
    const maxValue = evaluation.configuration.detail?.range.to ?? 10

    return (
      <RangeBadge
        value={Number(value)}
        minValue={minValue}
        maxValue={maxValue}
      />
    )
  }

  return <Text.H4 noWrap>{String(value)}</Text.H4>
}

type EvaluationResultRow = EvaluationResultWithMetadata & {
  realtimeAdded?: boolean
}
export const SelectableEvaluationResultsTable = ({
  evaluation,
  evaluationResultsRows,
  selectedResults,
  setSelectedResults,
  totalCount,
  pageSize,
  page,
  setPage,
}: {
  evaluation: EvaluationDto
  evaluationResultsRows: EvaluationResultRow[]
  selectedResults: EvaluationResultRow[]
  setSelectedResults: Dispatch<SetStateAction<EvaluationResultRow[]>>
  totalCount: number
  pageSize: number
  page: number
  setPage: (_: number) => void
}) => {
  return (
    <Table
      className='table-auto'
      externalFooter={
        <LogicTablePaginationFooter
          page={page}
          totalCount={totalCount}
          totalCountLabel={`${totalCount} results, ${selectedResults.length} selected`}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead />
          <TableHead>Time</TableHead>
          <TableHead>Origin</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='custom-scrollbar'>
        {evaluationResultsRows.map((evaluationResult) => {
          const isSelected = !!selectedResults.find(
            (r) => r.id === evaluationResult.id,
          )
          const toggleSelection = () => {
            if (isSelected) {
              setSelectedResults((old) =>
                old.filter((r) => r.id !== evaluationResult.id),
              )
            } else {
              setSelectedResults((old) => [...old, evaluationResult])
            }
          }

          return (
            <TableRow
              key={evaluationResult.id}
              onClick={toggleSelection}
              className={cn(
                'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
                {
                  'bg-primary/10 hover:bg-primary/15': isSelected,
                  'animate-flash': evaluationResult.realtimeAdded,
                },
              )}
            >
              <TableCell>
                <input type='checkbox' checked={isSelected} />
              </TableCell>
              <TableCell>
                <Text.H5 noWrap>
                  <time
                    dateTime={evaluationResult.createdAt.toISOString()}
                    suppressHydrationWarning
                  >
                    {relativeTime(evaluationResult.createdAt)}
                  </time>
                </Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5 noWrap>
                  {evaluationResult.source
                    ? capitalize(evaluationResult.source)
                    : '-'}
                </Text.H5>
              </TableCell>
              <TableCell>
                <ResultCellContent
                  evaluation={evaluation}
                  value={evaluationResult.result}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
