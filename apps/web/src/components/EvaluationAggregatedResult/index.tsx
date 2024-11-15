'use client'

import {
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { RangeBadge, Skeleton, Text } from '@latitude-data/web-ui'
import useEvaluationResultsMeanValue from '$/stores/evaluationResultCharts/evaluationResultsMeanValue'
import useEvaluationResultsModalValue from '$/stores/evaluationResultCharts/evaluationResultsModalValue'

function EvaluationMeanValue({
  evaluation,
  documentUuid,
  commitUuid,
}: {
  evaluation: EvaluationDto
  documentUuid: string
  commitUuid: string
}) {
  const { data, isLoading } = useEvaluationResultsMeanValue(
    {
      commitUuid,
      documentUuid,
      evaluationId: evaluation.id,
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  )

  if (isLoading || data == null) {
    return <Skeleton height='h4' className='w-6' />
  }

  return (
    <RangeBadge
      value={data.meanValue}
      minValue={data.minValue}
      maxValue={data.maxValue}
    />
  )
}

function EvaluationBooleanValue({
  evaluation,
  documentUuid,
  commitUuid,
}: {
  evaluation: EvaluationDto
  documentUuid: string
  commitUuid: string
}) {
  const { data, isLoading } = useEvaluationResultsModalValue(
    {
      commitUuid,
      documentUuid,
      evaluationId: evaluation.id,
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  )

  if (isLoading || data == null) {
    return (
      <div className='flex flex-col items-center gap-1'>
        <Skeleton height='h5' className='w-14 rounded-sm' />
        <Skeleton className='h-0.5 w-full' />
      </div>
    )
  }

  return (
    <div className='flex flex-col items-center gap-1'>
      <Text.H5 noWrap>{data.percentage}%</Text.H5>
      <div className='w-full min-h-0.5 rounded-sm overflow-hidden relative bg-destructive'>
        <div
          className='absolute top-0 left-0 h-full w-full bg-success border-r-[1px] border-white'
          style={{
            width: `${data.percentage}%`,
          }}
        />
      </div>
    </div>
  )
}

function EvaluationModalValue({
  evaluation,
  documentUuid,
  commitUuid,
}: {
  evaluation: EvaluationDto
  documentUuid: string
  commitUuid: string
}) {
  const { data, isLoading } = useEvaluationResultsModalValue(
    {
      commitUuid,
      documentUuid,
      evaluationId: evaluation.id,
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  )

  if (isLoading || data == undefined) {
    return (
      <div className='flex flex-wrap items-center gap-1'>
        <Skeleton className='min-w-16 animate-pulse' height='h4' />
        <Skeleton className='min-w-5 animate-pulse' height='h4' />
      </div>
    )
  }

  return (
    <div className='flex flex-wrap items-center gap-1'>
      <Text.H5 noWrap>{data.mostCommon}</Text.H5>
      <Text.H5 noWrap color='foregroundMuted'>
        ({data.percentage}%)
      </Text.H5>
    </div>
  )
}

export default function EvaluationAggregatedResult({
  evaluation,
  documentUuid,
  commitUuid,
}: {
  evaluation: EvaluationDto
  documentUuid: string
  commitUuid: string
}) {
  if (evaluation.resultType === EvaluationResultableType.Number) {
    return (
      <EvaluationMeanValue
        evaluation={evaluation}
        documentUuid={documentUuid}
        commitUuid={commitUuid}
      />
    )
  }

  if (evaluation.resultType === EvaluationResultableType.Boolean) {
    return (
      <EvaluationBooleanValue
        evaluation={evaluation}
        documentUuid={documentUuid}
        commitUuid={commitUuid}
      />
    )
  }

  return (
    <EvaluationModalValue
      evaluation={evaluation}
      documentUuid={documentUuid}
      commitUuid={commitUuid}
    />
  )
}
