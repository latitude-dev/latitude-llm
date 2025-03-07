import { useMemo } from 'react'

import {
  BreadcrumbItem,
  BreadcrumbItemSkeleton,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui'
import { EvaluationRoutes, ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'

import { BreadcrumbSelector, BreadcrumbSelectorOption } from '../Selector'

export function EvaluationBreadcrumbItems({
  segments,
}: {
  segments: string[]
}) {
  const evaluationUuid = segments[0]!
  const evaluationSegment = segments[1] as EvaluationRoutes | undefined

  const { data: evaluations, isLoading } = useEvaluations()
  const currentEvaluation = useMemo(
    () => evaluations?.find((evaluation) => evaluation.uuid === evaluationUuid),
    [evaluations, evaluationUuid],
  )

  const options = useMemo<BreadcrumbSelectorOption[]>(() => {
    if (!evaluations) return []
    return evaluations.map((p) => {
      const baseRoute = ROUTES.evaluations.detail({ uuid: p.uuid })
      const href = evaluationSegment
        ? (baseRoute[evaluationSegment]?.root ?? baseRoute.root)
        : baseRoute.root

      return {
        label: p.name,
        href,
      }
    })
  }, [evaluations, segments])

  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        {isLoading ? (
          <BreadcrumbItemSkeleton />
        ) : (
          <BreadcrumbSelector
            label={currentEvaluation?.name || 'Unknown'}
            options={options}
          />
        )}
      </BreadcrumbItem>
    </>
  )
}
