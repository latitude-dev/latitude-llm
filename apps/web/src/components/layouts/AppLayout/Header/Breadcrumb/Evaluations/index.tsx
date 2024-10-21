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

  const { data: evaluations, isLoading } = useEvaluations()
  const currentEvaluation = useMemo(
    () => evaluations?.find((evaluation) => evaluation.uuid === evaluationUuid),
    [evaluations, evaluationUuid],
  )

  const options = useMemo<BreadcrumbSelectorOption[]>(() => {
    if (!evaluations) return []
    return evaluations.map((p) => ({
      label: p.name,
      href: segments[1]
        ? ROUTES.evaluations.detail({ uuid: p.uuid })[
            segments[1] as EvaluationRoutes
          ].root
        : ROUTES.evaluations.detail({ uuid: p.uuid }).root,
    }))
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
