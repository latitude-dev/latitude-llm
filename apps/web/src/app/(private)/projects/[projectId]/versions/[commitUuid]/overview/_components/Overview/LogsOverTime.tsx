'use client'

import { useMemo } from 'react'

import { BarChart, ChartBlankSlate, Text } from '@latitude-data/web-ui'

import { ChartWrapper } from '../../../documents/[documentUuid]/evaluations/[evaluationId]/_components/MetricsSummary/Charts/ChartContainer'

const formatDate = (date: number) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

const ONE_DAY_IN_MS = 86400000

export function LogsOverTime({
  data,
  isLoading,
  error,
}: {
  data?: Array<{ date: Date; count: number }>
  isLoading: boolean
  error?: Error
}) {
  const parsedData = useMemo(
    () =>
      data?.map((r) => ({
        x: r.date.getTime(),
        y: r.count,
      })) || [],
    [data],
  )

  const minDate = useMemo(() => {
    if (!data || data.length === 0) return 0
    const min = data.reduce(
      (min, r) => (r.date.getTime() < min ? r.date.getTime() : min),
      data[0]!.date.getTime(),
    )
    return min - ONE_DAY_IN_MS // We add an extra day (in milliseconds) to the min date for some visual padding in the bar chart
  }, [data])

  const maxDate = useMemo(() => {
    if (!data || data.length === 0) return 0
    const max = data.reduce(
      (max, r) => (r.date.getTime() > max ? r.date.getTime() : max),
      data[0]!.date.getTime(),
    )
    return max + ONE_DAY_IN_MS // Adding an extra day at the end for visual padding
  }, [data])

  return (
    <ChartWrapper label='Logs over time' loading={isLoading} error={error}>
      {!data?.length ? null : (
        <BarChart
          config={{
            xAxis: {
              label: 'Date',
              type: 'number',
              min: minDate,
              max: maxDate,
              tickFormatter: (value: string | number) =>
                formatDate(Number(value)),
            },
            yAxis: {
              label: 'Number of logs',
              type: 'number',
              min: 0,
            },
            data: parsedData,
            tooltipLabel: (item) => formatDate(item.x as number),
            tooltipContent: (item) => {
              return (
                <div className='flex flex-col gap-2'>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Logs</Text.H6B>
                    <Text.H6>{item.y}</Text.H6>
                  </div>
                </div>
              )
            },
          }}
        />
      )}
      {!parsedData.length && (
        <ChartBlankSlate>No logs found so far.</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
