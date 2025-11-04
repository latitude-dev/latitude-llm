import { NumeredList } from '@latitude-data/web-ui/molecules/NumeredList'
import { ExperimentFormPayload } from './useExperimentFormPayload'
import { DatasetSelector } from './_components/DatasetSelector'
import { DatasetRowsInput } from './_components/DatasetRowsInput'
import { ParametersSelection } from './_components/ParametersSelection'
import { EvaluationsSelector } from './_components/EvaluationsSelector'
import { ExperimentVariantsInput } from './_components/VariantsInput'
import { EvaluationV2 } from '@latitude-data/constants'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { NoDatasetRangeInput } from './_components/NoDatasetRangeInput'
import { useMemo } from 'react'
import { ExperimentSimulationSettings } from './_components/SimulationSettings'

function hasToSelectDataset({
  parametersCount,
  selectedEvaluations,
}: {
  parametersCount: number
  selectedEvaluations: EvaluationV2[]
}): boolean {
  const evaluationRequiresLabel = selectedEvaluations.some((evaluation) => {
    const specification = getEvaluationMetricSpecification(evaluation)
    return specification.requiresExpectedOutput
  })

  if (evaluationRequiresLabel) return true
  return parametersCount > 0
}

export default function ExperimentModalForm(payload: ExperimentFormPayload) {
  const { parameters, selectedEvaluations } = payload
  const showDatasetInput = useMemo(
    () =>
      hasToSelectDataset({
        parametersCount: parameters.length,
        selectedEvaluations: selectedEvaluations,
      }),
    [parameters.length, selectedEvaluations],
  )

  return (
    <NumeredList>
      <NumeredList.Item
        title='Define the experiment variants'
        className='gap-y-0'
      >
        <ExperimentVariantsInput {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Pick the evaluations you want to run'>
        <EvaluationsSelector {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Select how to run the prompt'>
        {payload.isLoadingMetadata ? (
          <Skeleton className='h-6 w-full' />
        ) : showDatasetInput ? (
          <div className='flex flex-col gap-2'>
            <DatasetSelector {...payload} />
            <DatasetRowsInput {...payload} />
            <ParametersSelection {...payload} />
          </div>
        ) : (
          <NoDatasetRangeInput {...payload} />
        )}
      </NumeredList.Item>

      <ExperimentSimulationSettings {...payload} />
    </NumeredList>
  )
}
