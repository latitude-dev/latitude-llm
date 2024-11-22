'use client'

import { useMemo, useState } from 'react'

import { Commit, TraceWithSpans, Workspace } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  Badge,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useTracesPagination from '$/stores/useTracesPagination'
import { useSearchParams } from 'next/navigation'

import { TraceInfo } from './TraceInfo'

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

type Props = {
  projectId: number
  commit: Commit
  workspace: Workspace
}

export function TracesTable({ projectId, commit, workspace }: Props) {
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? '25'
  const [selectedTrace, setSelectedTrace] = useState<string | undefined>()

  const { data: traces, isLoading } = useTracesPagination({
    projectId,
    page: Number(page),
    pageSize: Number(pageSize),
  })

  const selectedTraceData = useMemo(() => {
    if (!selectedTrace) return undefined
    return traces?.items.find((t) => t.traceId === selectedTrace)
  }, [selectedTrace, traces?.items])

  return (
    <div className='flex flex-row flex-grow min-h-0 w-full gap-4 min-w-[1024px] overflow-x-auto'>
      <div className='flex flex-col flex-grow h-full gap-y-4 min-w-0 lg:w-1/2 2xl:w-2/3'>
        <Table className='table-auto'>
          <TableHeader className='sticky top-0 z-10'>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Cost ($)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces?.items.map((trace: TraceWithSpans) => {
              const totalDuration = trace.endTime
                ? new Date(trace.endTime).getTime() -
                  new Date(trace.startTime).getTime()
                : undefined

              const { totalCost, totalTokens } = calculateGenerationMetrics(
                trace.spans,
              )

              const providers = getUniqueSpanAttributes(
                trace.spans,
                'gen_ai.system',
              )
              const models = getUniqueSpanAttributes(
                trace.spans,
                'gen_ai.request.model',
              )

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
                    },
                  )}
                >
                  <TableCell>
                    <Text.H5 noWrap>{relativeTime(trace.startTime)}</Text.H5>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {providers.length > 0 ? (
                        providers.map((provider) => (
                          <Badge key={provider} variant='secondary' size='sm'>
                            <Text.H6 noWrap>{provider}</Text.H6>
                          </Badge>
                        ))
                      ) : (
                        <Text.H5 noWrap>-</Text.H5>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {models.length > 0 ? (
                        models.map((model) => (
                          <Badge key={model} variant='secondary' size='sm'>
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
                    <Text.H5 noWrap>{totalTokens ? totalTokens : '-'}</Text.H5>
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
          pagination={
            traces
              ? buildPagination({
                  baseUrl: ROUTES.projects
                    .detail({ id: projectId })
                    .commits.detail({ uuid: commit.uuid }).traces.root,
                  count: traces.count,
                  page: Number(page),
                  pageSize: Number(pageSize),
                })
              : undefined
          }
        />
      </div>
      {selectedTrace && selectedTraceData && (
        <div className='lg:w-1/2 2xl:w-1/3'>
          <TraceInfo
            projectId={projectId}
            traceId={selectedTrace}
            workspace={workspace}
            trace={selectedTraceData}
          />
        </div>
      )}
    </div>
  )
}
