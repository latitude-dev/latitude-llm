import { EvaluationRoutes, ROUTES } from '$/services/routes'
import { useMemo } from 'react'

import {
  EvaluationDto,
  EvaluationResultDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  Skeleton,
  Text,
  Tooltip,
  cn,
} from '@latitude-data/web-ui'
import Link from 'next/link'

import LiveEvaluationToggle from '../../../../../evaluations/[evaluationId]/_components/Actions/LiveEvaluationToggle'
import { ResultCellContent as OriginalResultCellContent } from '../../../../../evaluations/[evaluationId]/_components/EvaluationResults/EvaluationResultsTable'
import { Props } from './shared'

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
  result?: EvaluationResultDto
  evaluation: Props['evaluations'][number]
  runCount: number
  isWaiting: boolean
}) {
  if (!runCount || !evaluation.live || (!isWaiting && !result)) {
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

  if (isWaiting) {
    return (
      <span className='flex flex-col gap-y-2.5 pt-1'>
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-full' />
      </span>
    )
  }

  return (
    <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
      {result!.reason || 'No reason'}
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
}: Omit<Props, 'results' | 'evaluations'> & {
  result?: EvaluationResultDto
  evaluation: Props['evaluations'][number]
}) {
  const route = useMemo(() => {
    const query = new URLSearchParams()
    query.set(
      'back',
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid }).root,
    )
    if (evaluation.live && !isWaiting && result?.evaluatedProviderLogId) {
      query.set('providerLogId', result.evaluatedProviderLogId.toString())
    }

    return (
      ROUTES.evaluations.detail({ uuid: evaluation.uuid })[
        EvaluationRoutes.editor
      ].root + `?${query.toString()}`
    )
  }, [project, commit, document, result, evaluation])

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
          {evaluation.live && !isWaiting && result && (
            <ResultCellContent result={result} evaluation={evaluation} />
          )}
        </span>
        <div className='flex flex-row items-center gap-2 flex-shrink-0'>
          <LiveEvaluationToggle
            documentUuid={document.documentUuid}
            evaluation={evaluation}
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
