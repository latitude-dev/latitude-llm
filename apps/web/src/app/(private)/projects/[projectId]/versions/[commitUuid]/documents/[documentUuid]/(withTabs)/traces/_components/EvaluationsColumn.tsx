'use client'

import { useMemo } from 'react'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { getEvaluationMetricSpecification } from '$/components/evaluations'

export function EvaluationsColumn({
  spanId,
  documentLogUuid,
}: {
  spanId: string
  documentLogUuid: string | null | undefined
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: evaluationResults, isLoading } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId,
    documentLogUuid,
  })

  const { data: evaluations } = useEvaluationsV2({
    project,
    commit,
    document,
  })

  const passedResults = useMemo(
    () =>
      evaluationResults.filter((result) => !!result.result.hasPassed).length,
    [evaluationResults],
  )

  const pendingResults = useMemo(
    () =>
      evaluations.filter(
        (e) =>
          getEvaluationMetricSpecification(e).supportsManualEvaluation &&
          !evaluationResults.find((r) => r.evaluation.uuid === e.uuid),
      ).length,
    [evaluationResults, evaluations],
  )

  if (isLoading) {
    return <Skeleton className='w-full h-4' />
  }

  if (!evaluationResults.length && !pendingResults) {
    return <Text.H5>-</Text.H5>
  }

  return (
    <div className='flex justify-center items-center gap-2 shrink-0'>
      {evaluationResults.length > 0 && (
        <Badge
          variant={
            passedResults >= evaluationResults.length * 0.25
              ? passedResults >= evaluationResults.length * 0.75
                ? 'successMuted'
                : 'warningMuted'
              : 'destructiveMuted'
          }
        >
          <Text.H6>
            {passedResults}/{evaluationResults.length}
          </Text.H6>
        </Badge>
      )}
      {pendingResults > 0 && (
        <Badge variant='muted'>
          <Text.H6>{pendingResults} pending</Text.H6>
        </Badge>
      )}
    </div>
  )
}
