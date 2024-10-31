'use client'

import { useCallback, useMemo } from 'react'

import {
  EvaluationConfigurationNumerical,
  EvaluationDto,
} from '@latitude-data/core/browser'
import {
  Badge,
  ScatterChart,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import useAverageResultsAndCostOverCommit from '$/stores/evaluationResultCharts/numericalResults/averageResultAndCostOverCommitStore'
import { useDebouncedCallback } from 'use-debounce'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import { ChartWrapper, NoData } from '../ChartContainer'

export function CostOverResultsChart({
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
  const { isLoading, error, data, refetch } =
    useAverageResultsAndCostOverCommit(
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
    evaluationId: evaluation.id,
    documentUuid,
    onStatusChange,
  })

  const parsedData = useMemo(
    () =>
      data?.map((r) => ({
        x: Number(r.averageResult),
        y: Number(r.averageCostInMillicents) / 100_000,
        color:
          commit.id === r.id
            ? 'hsl(var(--primary))'
            : 'hsl(var(--muted-foreground))',
        size: commit.id === r.id ? 10 : 5,
        commitVersion: r.version,
        commitTitle: r.title,
      })) || [],
    [data],
  )

  return (
    <ChartWrapper label='Cost over results' loading={isLoading} error={error}>
      {!data?.length ? (
        <NoData />
      ) : (
        <ScatterChart
          config={{
            xAxis: {
              label: 'Average result',
              type: 'number',
              min: evaluationConfiguration.minValue,
              max: evaluationConfiguration.maxValue,
            },
            yAxis: {
              label: 'Average cost',
              type: 'number',
              min: 0,
              max: 'auto',
            },
            data: parsedData,
            tooltipLabel: (item) => (
              <div className='flex flex-row gap-2 items-center'>
                <Badge
                  variant={item.commitVersion ? 'accent' : 'muted'}
                  shape='square'
                >
                  <Text.H6 noWrap>
                    {item.commitVersion ? `v${item.commitVersion}` : 'Draft'}
                  </Text.H6>
                </Badge>
                <Text.H5>{item.commitTitle}</Text.H5>
              </div>
            ),
            tooltipContent: (item) => (
              <div className='flex w-full flex-col gap-2'>
                <div className='flex w-full gap-2 justify-between'>
                  <Text.H6B>Average result</Text.H6B>
                  <Text.H6>{Number(item.x).toFixed(2)}</Text.H6>
                </div>
                <div className='flex w-full gap-2 justify-between'>
                  <Text.H6B>Average cost</Text.H6B>
                  <Text.H6>$ {Number(item.y).toFixed(5)}</Text.H6>
                </div>
              </div>
            ),
          }}
        />
      )}
    </ChartWrapper>
  )
}
