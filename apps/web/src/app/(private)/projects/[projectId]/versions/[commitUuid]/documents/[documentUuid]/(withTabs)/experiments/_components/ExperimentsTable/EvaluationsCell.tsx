import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import type { EvaluationV2, ExperimentDto } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import { useMemo } from 'react'

function EvaluationsList({ evaluations }: { evaluations: (EvaluationV2 | undefined)[] }) {
  return (
    <div className='flex flex-nowrap overflow-x-auto max-w-full gap-2'>
      <Badge variant='secondary' className='max-w-32'>
        <Text.H6 noWrap ellipsis>
          {evaluations[0]?.name ?? 'Removed evaluation'}
        </Text.H6>
      </Badge>

      {evaluations.length === 2 && (
        <Badge variant='secondary' className='max-w-32'>
          <Text.H6 noWrap ellipsis>
            {evaluations[1]?.name ?? 'Removed evaluation'}
          </Text.H6>
        </Badge>
      )}

      {evaluations.length > 2 && (
        <Badge variant='secondary'>
          <Text.H6 noWrap>+{evaluations.length - 1}</Text.H6>
        </Badge>
      )}
    </div>
  )
}

export function EvaluationsCell({ experiment }: { experiment: ExperimentDto }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: evaluations, isLoading: isLoadingEvaluations } = useEvaluationsV2({
    project,
    commit,
    document,
  })

  const experimentEvaluations = useMemo(() => {
    if (isLoadingEvaluations) return undefined
    if (!experiment) return undefined
    return experiment.evaluationUuids.map((evaluationUuid) => {
      return evaluations.find((evaluation) => evaluation.uuid === evaluationUuid)
    })
  }, [evaluations, experiment, isLoadingEvaluations])

  if (!experiment.evaluationUuids.length) {
    return <Text.H6 color='foregroundMuted'>No evaluations</Text.H6>
  }

  if (isLoadingEvaluations || !experimentEvaluations) {
    return (
      <div className='flex flex-nowrap overflow-x-auto max-w-full'>
        <Skeleton height='h6' className='w-[20%]' />
        {experiment.evaluationUuids.length > 1 && <Skeleton height='h6' className='w-[20%]' />}
      </div>
    )
  }

  return <EvaluationsList evaluations={experimentEvaluations} />
}
