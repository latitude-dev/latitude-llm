import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import EvaluateLiveLogsSwitch from '$/components/evaluations/EvaluateLiveLogsSwitch'
import ResultBadge from '$/components/evaluations/ResultBadge'
import { useEvaluationEditorLink } from '$/lib/useEvaluationEditorLink'
import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useMemo } from 'react'
import { Props } from './shared'

function EvaluationItemContent<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  result,
  evaluation,
  runCount,
  isWaiting,
}: {
  result?: EvaluationResultV2<T, M>
  evaluation: EvaluationV2<T, M>
  runCount: number
  isWaiting: boolean
}) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) return null

  if (!runCount || !evaluation.evaluateLiveLogs || (!isWaiting && !result)) {
    return (
      <Text.H6
        userSelect={false}
        color='foregroundMuted'
        wordBreak='breakAll'
        ellipsis
        lineClamp={3}
      >
        {evaluation.description || 'No description'}
      </Text.H6>
    )
  }

  if (isWaiting || !result) {
    return (
      <span className='flex flex-col gap-y-2.5 pt-1'>
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-full' />
      </span>
    )
  }

  if (result.error) {
    return (
      <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
        {result.error!.message}
      </Text.H6>
    )
  }

  return (
    <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
      {metricSpecification.resultReason(
        result as EvaluationResultSuccessValue<T, M>,
      ) || 'No reason reported'}
    </Text.H6>
  )
}

export default function EvaluationItem({
  result,
  evaluation,
  document,
  commit,
  project,
  runCount,
  isWaiting,
  documentLog,
}: Omit<Props, 'results' | 'evaluations'> & {
  result?: EvaluationResultV2
  evaluation: Props['evaluations'][number]
}) {
  const goToEvaluationsV2Editor = useEvaluationEditorLink({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  }) /* eslint-disable react-hooks/exhaustive-deps */
  const route = useMemo(() => {
    const documentLogUuid = documentLog?.uuid
    return goToEvaluationsV2Editor({
      evaluationUuid: evaluation.uuid,
      documentLogUuid,
    })
  }, [
    project,
    commit,
    document,
    result,
    evaluation,
    isWaiting,
    documentLog,
    goToEvaluationsV2Editor,
  ])

  return (
    <div
      className={cn(
        'flex flex-col flex-grow flex-shrink items-center justify-start gap-2',
        'border p-4 rounded-lg overflow-hidden',
        'h-full basis-full',
        (!runCount || (runCount === 1 && isWaiting)) && 'h-32 basis-60',
      )}
    >
      <div className='flex flex-row items-center justify-between gap-2 w-full'>
        <span className='flex flex-row items-center gap-x-2 truncate'>
          <Text.H5 ellipsis noWrap>
            {evaluation.name}
          </Text.H5>
          {evaluation.evaluateLiveLogs && !isWaiting && result && (
            <ResultBadge evaluation={evaluation} result={result} />
          )}
        </span>
        <div className='flex flex-row items-center gap-2 flex-shrink-0'>
          <EvaluateLiveLogsSwitch
            evaluation={evaluation}
            disabled={isWaiting}
          />
          <Link href={route}>
            <Button
              variant='ghost'
              size='icon'
              iconProps={{
                name: 'settings',
              }}
            />
          </Link>
        </div>
      </div>
      <div className='w-full h-full !leading-5'>
        <EvaluationItemContent
          result={result}
          evaluation={evaluation}
          runCount={runCount}
          isWaiting={isWaiting}
        />
      </div>
    </div>
  )
}
