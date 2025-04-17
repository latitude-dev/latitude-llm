import { ExperimentFormPayload } from '../useExperimentFormPayload'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { MultiSelect } from '@latitude-data/web-ui/molecules/MultiSelect'

export function EvaluationsSelector({
  project,
  commit,
  document,
  selectedEvaluations,
  setSelectedEvaluations,
}: ExperimentFormPayload) {
  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({
      project,
      commit,
      document,
    })

  if (isLoadingEvaluations) {
    return <Skeleton height='h2' className='w-full' />
  }

  return (
    <div className='flex flex-col gap-3'>
      <MultiSelect
        info='Leave empty to not run any evaluations'
        label='Evaluations'
        name='evaluations'
        defaultValue={selectedEvaluations.map((ev) => ev.uuid)}
        options={evaluations.map((evaluation) => {
          const spec = getEvaluationMetricSpecification(evaluation)
          return {
            icon: spec.icon,
            value: evaluation.uuid,
            label: evaluation.name,
          }
        })}
        onChange={(uuids) => {
          setSelectedEvaluations(
            uuids.map((uuid) => evaluations.find((ev) => ev.uuid === uuid)!),
          )
        }}
      />
      {selectedEvaluations.length == 0 && (
        <Text.H6 color='foregroundMuted'>
          The results will not be evaluated.
        </Text.H6>
      )}
    </div>
  )
}
