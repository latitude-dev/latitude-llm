import { ReactNode, useMemo } from 'react'

import {
  Commit,
  Evaluation,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  Icon,
  RangeBadge,
  Skeleton,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'

function Panel({
  label,
  value,
  additionalInfo,
  children,
}: {
  label: string
  value?: string
  additionalInfo?: string
  children?: ReactNode
}) {
  const panel = (
    <div className='min-w-44 flex-1 flex flex-col gap-1 p-4 rounded-lg border border-border'>
      <div className='flex flex-row justify-between items-center gap-1'>
        <Text.H5 color='foregroundMuted'>{label}</Text.H5>
        {additionalInfo && (
          <Icon name='info' className='text-muted-foreground' />
        )}
      </div>
      {value && <Text.H3B>{value}</Text.H3B>}
      {children}
    </div>
  )

  if (additionalInfo) {
    return (
      <Tooltip side='left' trigger={panel}>
        <Text.H5 color='white'>{additionalInfo}</Text.H5>
      </Tooltip>
    )
  }

  return panel
}

function TypeSpecificPanel({
  evaluation,
  evaluationResults,
  commit,
}: {
  evaluation: Evaluation
  evaluationResults: EvaluationResultWithMetadata[]
  commit?: Commit
}) {
  const label =
    evaluation.configuration.type == EvaluationResultableType.Number
      ? 'Current average'
      : 'Current modal'

  const additionalInfo =
    evaluation.configuration.type == EvaluationResultableType.Number
      ? 'The mean value of all the evaluated results from the current version.'
      : 'The most common result from the current version.'

  if (!commit) {
    return (
      <Panel label={label} additionalInfo={additionalInfo}>
        <Skeleton className='w-16 h-4 bg-muted animate-pulse' />
      </Panel>
    )
  }

  const value = useMemo<ReactNode>(() => {
    const resultsFromCommit = evaluationResults.filter(
      (e) => e.commit.id === commit.id,
    )

    if (resultsFromCommit.length == 0) {
      return <Text.H4 color='foregroundMuted'>No data</Text.H4>
    }

    if (evaluation.configuration.type == EvaluationResultableType.Number) {
      const { to: maxValue, from: minValue } =
        evaluation.configuration.detail!.range
      const sumValue = resultsFromCommit.reduce((acc, result) => {
        return acc + Number(result.result)
      }, 0)

      const meanValue = sumValue / resultsFromCommit.length

      return (
        <div className='w-fit'>
          <RangeBadge
            minValue={minValue}
            maxValue={maxValue}
            value={meanValue}
          />
        </div>
      )
    }

    const resultCounts = resultsFromCommit.reduce(
      (acc, result) => {
        const value = result.result as string
        if (!acc[value]) {
          acc[value] = 0
        }
        acc[value] += 1
        return acc
      },
      {} as Record<string, number>,
    )

    const mostCommonResult = Object.keys(resultCounts).reduce((a, b) =>
      resultCounts[a]! > resultCounts[b]! ? a : b,
    )

    const resultPresence =
      (resultCounts[mostCommonResult]! / resultsFromCommit.length) * 100

    return (
      <>
        <Text.H3B>{mostCommonResult}</Text.H3B>
        <Text.H3 color='foregroundMuted'> ({resultPresence} %)</Text.H3>
      </>
    )
  }, [evaluation, evaluationResults, commit])

  return (
    <Panel label={label} additionalInfo={additionalInfo}>
      {value}
    </Panel>
  )
}

export function BigNumberPanels({
  evaluation,
  evaluationResults,
  commit,
}: {
  evaluation: Evaluation
  evaluationResults: EvaluationResultWithMetadata[]
  commit?: Commit
}) {
  const totalCost = useMemo(() => {
    return evaluationResults.reduce((acc, result) => {
      return acc + (result.costInMillicents ?? 0)
    }, 0)
  }, [evaluationResults])

  const totalTokens = useMemo(() => {
    return evaluationResults.reduce((acc, result) => {
      return acc + (result.tokens ?? 0)
    }, 0)
  }, [evaluationResults])

  return (
    <div className='flex flex-wrap gap-6'>
      <Panel label='Total logs' value={String(evaluationResults.length)} />
      <Panel label='Total cost' value={formatCostInMillicents(totalCost)} />
      <Panel label='Total tokens' value={String(totalTokens)} />
      <TypeSpecificPanel
        evaluation={evaluation}
        evaluationResults={evaluationResults}
        commit={commit}
      />
    </div>
  )
}
