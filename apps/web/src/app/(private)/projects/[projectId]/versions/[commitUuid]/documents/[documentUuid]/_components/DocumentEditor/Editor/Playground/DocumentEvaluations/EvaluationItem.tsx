import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import EvaluateLiveLogsSwitch from '$/components/evaluations/EvaluateLiveLogsSwitch'
import ResultBadge from '$/components/evaluations/ResultBadge'
import { EvaluationRoutes, ROUTES } from '$/services/routes'
import {
  EvaluationDto,
  EvaluationResultDto,
  EvaluationResultTmp,
  EvaluationResultV2,
  EvaluationResultableType,
  EvaluationType,
} from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useMemo } from 'react'
import LiveEvaluationToggle from '../../../../../evaluations/[evaluationId]/_components/Actions/LiveEvaluationToggle'
import { ResultCellContent as OriginalResultCellContent } from '../../../../../evaluations/[evaluationId]/_components/EvaluationResults/EvaluationResultsTable'
import { Props } from './shared'
import { useEvaluationEditorLink } from '$/lib/useEvaluationEditorLink'

function ResultCellContent({
  result,
  evaluation,
}: {
  result: EvaluationResultDto
  evaluation: EvaluationDto
}) {
  if (result.resultableType === EvaluationResultableType.Text) {
    return (
      <Tooltip asChild trigger={<Badge variant='outline'>text</Badge>}>
        {result.result}
      </Tooltip>
    )
  }

  return (
    <OriginalResultCellContent evaluation={evaluation} value={result.result} />
  )
}

function EvaluationItemContent({
  result,
  evaluation,
  runCount,
  isWaiting,
}: {
  result?: EvaluationResultTmp
  evaluation: Props['evaluations'][number]
  runCount: number
  isWaiting: boolean
}) {
  if (
    !runCount ||
    (evaluation.version === 'v2' && !evaluation.evaluateLiveLogs) ||
    (evaluation.version !== 'v2' && !evaluation.live) ||
    (!isWaiting && !result)
  ) {
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

  if (evaluation.version === 'v2') {
    if ((result as EvaluationResultV2).error) {
      return (
        <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
          {(result as EvaluationResultV2).error!.message}
        </Text.H6>
      )
    }

    if (
      evaluation.type === EvaluationType.Llm ||
      evaluation.type === EvaluationType.Human
    ) {
      return (
        <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
          {(
            result as EvaluationResultV2<
              EvaluationType.Llm | EvaluationType.Human
            >
          ).metadata!.reason || 'No reason reported'}
        </Text.H6>
      )
    }

    return (
      <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
        {EVALUATION_SPECIFICATIONS[evaluation.type].name} evaluations do not
        report a reason
      </Text.H6>
    )
  }

  return (
    <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
      {(result as EvaluationResultDto).reason || 'No reason reported'}
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
  result?: EvaluationResultTmp
  evaluation: Props['evaluations'][number]
}) {
  const goToEvaluationsV2Editor = useEvaluationEditorLink({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })
  const route = useMemo(() => {
    const documentLogUuid = documentLog?.uuid
    if (evaluation.version === 'v2') {
      return goToEvaluationsV2Editor({
        evaluationUuid: evaluation.uuid,
        documentLogUuid,
      })
    }

    const resultV1 = result as EvaluationResultDto
    const query = new URLSearchParams()
    query.set(
      'back',
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid }).root,
    )
    if (evaluation.live && !isWaiting && resultV1?.evaluatedProviderLogId) {
      query.set('providerLogId', resultV1.evaluatedProviderLogId.toString())
    }

    return (
      ROUTES.evaluations.detail({ uuid: evaluation.uuid })[
        EvaluationRoutes.editor
      ].root + `?${query.toString()}`
    )
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
          {evaluation.version === 'v2' &&
            evaluation.evaluateLiveLogs &&
            !isWaiting &&
            result && (
              <ResultBadge
                evaluation={evaluation}
                result={result as EvaluationResultV2}
              />
            )}
          {evaluation.version !== 'v2' &&
            evaluation.live &&
            !isWaiting &&
            result && (
              <ResultCellContent
                result={result as EvaluationResultDto}
                evaluation={evaluation}
              />
            )}
        </span>
        <div className='flex flex-row items-center gap-2 flex-shrink-0'>
          {evaluation.version === 'v2' ? (
            <EvaluateLiveLogsSwitch
              evaluation={evaluation}
              disabled={isWaiting}
            />
          ) : (
            <LiveEvaluationToggle
              documentUuid={document.documentUuid}
              evaluation={evaluation}
              disabled={isWaiting}
            />
          )}
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
