'use client'

import { Key, useMemo, useState } from 'react'

import { TraceWithSpans } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { ListTracesResponse } from '@latitude-data/core/services/traces/list'
import {
  Badge,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
} from '@latitude-data/web-ui'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useTracesPagination from '$/stores/useTracesPagination'
import { useSearchParams, usePathname } from 'next/navigation'
import { useNavigate } from '$/hooks/useNavigate'

import { TraceInfo } from './TraceInfo'
import { useRealtimeTraces } from './useRealtimeTraces'
import { SearchBox } from './SearchBox'
import { CompletedSearch } from './types'

type Props = {
  traces: ListTracesResponse
}

export function TracesTable({ traces: serverTraces }: Props) {
  const navigate = useNavigate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filtersParam = searchParams.get('filters')
  const filters = filtersParam ? JSON.parse(filtersParam) : []
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? '25'
  const [selectedTrace, setSelectedTrace] = useState<string | undefined>()

  const { data: traces, isLoading } = useTracesPagination(
    {
      page: Number(page),
      pageSize: Number(pageSize),
      filters,
    },
    {
      fallbackData: serverTraces,
    },
  )

  useRealtimeTraces({
    page: Number(page),
    pageSize: Number(pageSize),
    filters,
    fallbackData: serverTraces,
  })

  const handleSearch = (completedSearches: CompletedSearch[]) => {
    const params = new URLSearchParams(searchParams)
    const newFilters = completedSearches.map((search) => ({
      field: search.column.field,
      operator: search.operator.value,
      value: search.value,
    }))

    params.set('page', '1')
    params.set('pageSize', '25')
    params.set('filters', JSON.stringify(newFilters))
    navigate.push(`${pathname}?${params.toString()}`)
  }

  const selectedTraceData = useMemo(() => {
    if (!selectedTrace) return undefined
    return traces?.items?.find(
      (t: TraceWithSpans) => t.traceId === selectedTrace,
    )
  }, [selectedTrace, traces?.items])

  const pagination = traces?.items
    ? buildPagination({
        baseUrl: ROUTES.traces.root,
        count: traces.count,
        page: Number(page),
        pageSize: Number(pageSize),
      })
    : undefined

  return (
    <div className='flex flex-row flex-grow min-h-0 w-full gap-4 min-w-[1024px] overflow-x-auto'>
      <div className='flex flex-col flex-grow h-full gap-y-4 min-w-0 lg:w-1/2 2xl:w-2/3'>
        <SearchBox onSearch={handleSearch} />
        {!traces?.items?.length && isLoading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : (
          <>
            <Table className='table-auto'>
              <TableHeader className='sticky top-0 z-10'>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost ($)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces?.items?.map((trace: TraceWithSpans) => {
                  const { totalDuration, totalCost, totalTokens, models } =
                    calculateTraceMetrics(trace)

                  return (
                    <TableRow
                      key={trace.traceId}
                      onClick={() =>
                        setSelectedTrace(
                          selectedTrace === trace.traceId
                            ? undefined
                            : trace.traceId,
                        )
                      }
                      className={cn(
                        'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
                        {
                          'bg-secondary': selectedTrace === trace.traceId,
                          'animate-flash': !!trace.realtimeAdded,
                        },
                      )}
                    >
                      <TableCell>
                        <Text.H5 noWrap>
                          {relativeTime(trace.startTime)}
                        </Text.H5>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap gap-1'>
                          {models.length > 0 ? (
                            models.map((model) => (
                              <Badge key={model as Key} variant='secondary'>
                                <Text.H6 noWrap>{model}</Text.H6>
                              </Badge>
                            ))
                          ) : (
                            <Text.H5 noWrap>-</Text.H5>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Text.H5 noWrap>
                          {totalDuration ? formatDuration(totalDuration) : '-'}
                        </Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5 noWrap>
                          {totalTokens ? totalTokens : '-'}
                        </Text.H5>
                      </TableCell>
                      <TableCell>
                        <Text.H5 noWrap>
                          {totalCost ? formatCostInMillicents(totalCost) : '-'}
                        </Text.H5>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <LinkableTablePaginationFooter
              countLabel={countLabel}
              isLoading={isLoading}
              pagination={pagination}
            />
          </>
        )}
      </div>
      {selectedTrace && selectedTraceData && (
        <div className='lg:w-1/2 2xl:w-1/3'>
          <TraceInfo trace={selectedTraceData} />
        </div>
      )}
    </div>
  )
}

function countLabel(count: number) {
  return `${count} traces`
}

function calculateGenerationMetrics(spans?: TraceWithSpans['spans']) {
  if (!spans) return { totalTokens: 0, totalCost: 0 }

  return spans.reduce(
    (acc, span) => {
      if (span.internalType === 'generation') {
        const cost = span.totalCostInMillicents ?? 0
        const tokens = span.totalTokens ?? 0

        return {
          totalCost: acc.totalCost + cost,
          totalTokens: acc.totalTokens + tokens,
        }
      }
      return acc
    },
    { totalTokens: 0, totalCost: 0 },
  )
}

function getUniqueSpanAttributes(
  spans: TraceWithSpans['spans'],
  attribute: string,
) {
  if (!spans) return []

  const uniqueValues = new Set(
    spans.map((span) => span.attributes?.[attribute]).filter(Boolean),
  )

  return Array.from(uniqueValues)
}

function calculateTraceMetrics(trace: TraceWithSpans) {
  const totalDuration = trace.spans?.length
    ? Math.max(
        ...trace.spans.map((s) =>
          s.endTime ? new Date(s.endTime).getTime() : 0,
        ),
      ) - Math.min(...trace.spans.map((s) => new Date(s.startTime).getTime()))
    : undefined

  const { totalCost, totalTokens } = calculateGenerationMetrics(trace.spans)

  const providers = getUniqueSpanAttributes(trace.spans, 'gen_ai.system')
  const models = getUniqueSpanAttributes(trace.spans, 'gen_ai.request.model')

  return {
    totalDuration,
    totalCost,
    totalTokens,
    providers,
    models,
  }
}
