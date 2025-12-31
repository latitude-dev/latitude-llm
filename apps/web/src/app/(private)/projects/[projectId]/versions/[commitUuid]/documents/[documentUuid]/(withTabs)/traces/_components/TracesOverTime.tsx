'use client'
import { useMemo } from 'react'

import { DailyCount } from '@latitude-data/core/services/tracing/spans/fetching/computeDocumentTracesDailyCount'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BarChart, ChartWrapper } from '@latitude-data/web-ui/molecules/Charts'

const formatDate = (date: number) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

const ONE_DAY_IN_MS = 86400000

export function TracesOverTime({
  data: rawData,
  isLoading,
  error,
}: {
  data?: DailyCount[]
  isLoading: boolean
  error?: Error
}) {
  const data = useMemo(
    () =>
      rawData?.map((r) => ({
        ...r,
        date: new Date(r.date),
      })),
    [rawData],
  )

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
    return min - ONE_DAY_IN_MS
  }, [data])

  const maxDate = useMemo(() => {
    if (!data || data.length === 0) return 0
    const max = data.reduce(
      (max, r) => (r.date.getTime() > max ? r.date.getTime() : max),
      data[0]!.date.getTime(),
    )
    return max + ONE_DAY_IN_MS
  }, [data])

  return (
    <ChartWrapper label='Traces over time' loading={isLoading} error={error}>
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
              label: 'Number of traces',
              type: 'number',
              min: 0,
            },
            data: parsedData,
            tooltipLabel: (item) => formatDate(item.x as number),
            tooltipContent: (item) => {
              return (
                <div className='flex flex-col gap-2'>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Traces</Text.H6B>
                    <Text.H6>{item.y}</Text.H6>
                  </div>
                </div>
              )
            },
          }}
        />
      )}
      {!parsedData.length && (
        <ChartBlankSlate>No traces found so far.</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
