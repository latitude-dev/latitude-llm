'use client'

import { Dispatch, SetStateAction, useCallback } from 'react'
import { capitalize } from 'lodash-es'

import {
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { EvaluationResultByDocument } from '@latitude-data/core/repositories'
import {
  Checkbox,
  cn,
  Icon,
  RangeBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { LogicTablePaginationFooterWithoutCount } from '$/components/TablePaginationFooter/TablePaginationFooterWithoutCount'
import { relativeTime } from '$/lib/relativeTime'

export const ResultCellContent = ({
  evaluation,
  value,
}: {
  evaluation: EvaluationDto
  value: unknown
}) => {
  if (evaluation.resultType === EvaluationResultableType.Boolean) {
    return (
      <Text.H5 color={(value as boolean) ? 'success' : 'destructive'}>
        {String(value)}
      </Text.H5>
    )
  }

  if (evaluation.resultType === EvaluationResultableType.Number) {
    const minValue = evaluation.resultConfiguration.minValue
    const maxValue = evaluation.resultConfiguration.maxValue

    return (
      <RangeBadge
        value={Number(value)}
        minValue={minValue}
        maxValue={maxValue}
      />
    )
  }

  return <Text.H5 noWrap>{String(value)}</Text.H5>
}

type EvaluationResultRow = EvaluationResultByDocument & {
  realtimeAdded?: boolean
}
export const SelectableEvaluationResultsTable = ({
  evaluation,
  evaluationResultsRows,
  selectedResults,
  setSelectedResults,
  page,
  nextPage = false,
  setPage,
}: {
  evaluation: EvaluationDto
  evaluationResultsRows: EvaluationResultRow[]
  selectedResults: EvaluationResultRow[]
  setSelectedResults: Dispatch<SetStateAction<EvaluationResultByDocument[]>>
  page: number
  nextPage?: boolean
  setPage: (_: number) => void
}) => {
  const toggleSelection = useCallback(
    (evaluationResult: EvaluationResultRow) => () => {
      const isSelected = !!selectedResults.find(
        (r) => r.id === evaluationResult.id,
      )
      if (isSelected) {
        setSelectedResults((old) =>
          old.filter((r) => r.id !== evaluationResult.id),
        )
      } else {
        setSelectedResults((old) => [...old, evaluationResult])
      }
    },
    [selectedResults, setSelectedResults],
  )
  return (
    <Table
      className='table-auto'
      externalFooter={
        <LogicTablePaginationFooterWithoutCount
          page={page}
          nextPage={nextPage}
          onPageChange={setPage}
        />
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead />
          <TableHead>Time</TableHead>
          <TableHead tooltipMessage='The logs with ≠ sign were generated with a different version of the prompt.' />
          <TableHead>Origin</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='custom-scrollbar'>
        {evaluationResultsRows.map((evaluationResult) => {
          const isSelected = !!selectedResults.find(
            (r) => r.id === evaluationResult.id,
          )

          return (
            <TableRow
              key={evaluationResult.id}
              onClick={toggleSelection(evaluationResult)}
              className={cn(
                'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
                {
                  'bg-primary/10 hover:bg-primary/15': isSelected,
                  'animate-flash': evaluationResult.realtimeAdded,
                },
              )}
            >
              <TableCell>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={toggleSelection(evaluationResult)}
                />
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
                {!evaluationResult.sameContent ? (
                  <Icon name='notEqual' />
                ) : null}
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
