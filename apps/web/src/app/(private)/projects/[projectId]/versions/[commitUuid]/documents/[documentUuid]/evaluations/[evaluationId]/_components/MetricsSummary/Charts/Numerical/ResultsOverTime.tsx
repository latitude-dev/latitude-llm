'use client'
import { useCallback, useMemo } from 'react'

import useAverageResultOverTime from '$/stores/evaluationResultCharts/numericalResults/averageResultOverTimeStore'
import {
  EvaluationConfigurationNumerical,
  EvaluationDto,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { AreaChart } from '@latitude-data/web-ui/molecules/Charts'
import { useDebouncedCallback } from 'use-debounce'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import { ChartWrapper, NoData } from '../ChartContainer'

const formatDate = (date: number) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function ResultOverTimeChart({
  evaluation,
  documentUuid,
}: {
  evaluation: EvaluationDto
  documentUuid: string
}) {
  const evaluationConfiguration =
    evaluation.resultConfiguration as EvaluationConfigurationNumerical
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { isLoading, error, data, refetch } = useAverageResultOverTime(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      evaluation,
      documentUuid,
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  )
  const onStatusChange = useDebouncedCallback(
    useCallback(() => refetch(), [refetch]),
    2000,
    { trailing: true },
  )
  useEvaluationStatusEvent({
    evaluation: { ...evaluation, version: 'v1' },
    documentUuid,
    onStatusChange,
  })

  const minDate = useMemo(() => {
    if (!data || data.length === 0) return 0
    return data.reduce(
      (min, r) => (r.date.getTime() < min ? r.date.getTime() : min),
      data[0]!.date.getTime(),
    )
  }, [data])

  const maxDate = useMemo(() => {
    if (!data || data.length === 0) return 0
    return data?.reduce(
      (max, r) => (r.date.getTime() > max ? r.date.getTime() : max),
      data[0]!.date.getTime(),
    )
  }, [data])

  const parsedData = useMemo(
    () =>
      data?.map((r) => ({
        x: r.date.getTime(),
        y: r.averageResult,
        count: Number(r.count),
      })) || [],
    [data],
  )

  return (
    <ChartWrapper label='Results over time' loading={isLoading} error={error}>
      {!data?.length ? (
        <NoData />
      ) : (
        <AreaChart
          config={{
            xAxis: {
              label: 'Evaluation date',
              type: 'number',
              min: minDate,
              max: maxDate,
              tickFormatter: (value) => formatDate(value as number),
            },
            yAxis: {
              label: 'Average result',
              type: 'number',
              min: evaluationConfiguration.minValue,
              max: evaluationConfiguration.maxValue,
            },
            data: parsedData,
            tooltipLabel: (item) => {
              return <Text.H5>{formatDate(item.x as number)}</Text.H5>
            },
            tooltipContent: (item) => {
              return (
                <div className='flex flex-col gap-2'>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Evaluations</Text.H6B>
                    <Text.H6>{item.count}</Text.H6>
                  </div>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Average result</Text.H6B>
                    <Text.H6>{(item.y as number).toFixed(2)}</Text.H6>
                  </div>
                </div>
              )
            },
          }}
        />
      )}
    </ChartWrapper>
  )
}
