import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'

import { EvaluationResultableType } from '@latitude-data/core/browser'
import { Badge, Button, Skeleton, Text } from '@latitude-data/web-ui'
import Link from 'next/link'

import EvaluationItem from './EvaluationItem'
import { Props } from './shared'

export function ExpandedContent({
  results,
  evaluations,
  isLoading,
  ...rest
}: Props) {
  if (isLoading) {
    return (
      <div className='w-full flex gap-4 items-center justify-center flex-wrap'>
        <Skeleton className='h-32 flex flex-col flex-grow basis-60 flex-shrink' />
        <Skeleton className='h-32 flex flex-col flex-grow basis-60 flex-shrink' />
      </div>
    )
  }

  if (!evaluations.length) {
    return (
      <div className='w-full flex gap-4 items-center justify-center'>
        <Text.H5 userSelect={false} color='foregroundMuted'>
          There are no evaluations connected yet
        </Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full flex gap-4 items-center justify-center flex-wrap'>
      {evaluations.map((evaluation) => (
        <EvaluationItem
          key={evaluation.uuid}
          result={results[evaluation.id]}
          evaluation={evaluation}
          isLoading={isLoading}
          {...rest}
        />
      ))}
    </div>
  )
}

export function ExpandedContentHeader({ document, commit, project }: Props) {
  const route = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).evaluations.dashboard
    .connect.root

  return (
    <div className='w-full flex items-center justify-end gap-4'>
      <Link href={route}>
        <Button variant='link' onClick={(e) => e.stopPropagation()}>
          + Connect an evaluation
        </Button>
      </Link>
    </div>
  )
}

export function CollapsedContentHeader({
  results,
  evaluations,
  runCount,
  isLoading,
  isWaiting,
}: Props) {
  const count = useMemo(() => {
    return evaluations.reduce(
      (acc, evaluation) => {
        if (!evaluation.live) return { ...acc, skipped: acc.skipped + 1 }
        if (!results[evaluation.id]) return { ...acc, skipped: acc.skipped + 1 }

        let value = results[evaluation.id]!.result
        if (value === undefined) return acc

        if (evaluation.resultType === EvaluationResultableType.Boolean) {
          value = typeof value === 'string' ? value === 'true' : Boolean(value)
          return value ? { ...acc, passed: acc.passed + 1 } : acc
        }

        if (evaluation.resultType === EvaluationResultableType.Number) {
          value = Number(value)
          return value >= evaluation.resultConfiguration.maxValue
            ? { ...acc, passed: acc.passed + 1 }
            : acc
        }

        return { ...acc, passed: acc.passed + 1 }
      },
      { passed: 0, skipped: 0 },
    )
  }, [results, evaluations])

  if (isLoading || isWaiting) {
    return (
      <div className='w-full flex items-center justify-end'>
        <Skeleton className='w-36 h-4' />
      </div>
    )
  }

  if (!evaluations.length) {
    return null
  }

  if (!runCount) {
    return (
      <div className='w-full flex items-center justify-end'>
        <Text.H5M userSelect={false} color='foregroundMuted' ellipsis noWrap>
          {evaluations.map((evaluation) => evaluation.name).join(' · ')}
        </Text.H5M>
      </div>
    )
  }

  return (
    <div className='w-full flex items-center justify-end gap-2'>
      {evaluations.length - count.skipped > 0 && (
        <Badge
          variant={
            count.passed
              ? count.passed >= (evaluations.length - count.skipped) / 2
                ? 'successMuted'
                : 'warningMuted'
              : 'destructiveMuted'
          }
        >
          {count.passed}/{evaluations.length - count.skipped} passed
        </Badge>
      )}
      {count.skipped > 0 && (
        <Badge variant='muted'>{count.skipped} skipped</Badge>
      )}
    </div>
  )
}
