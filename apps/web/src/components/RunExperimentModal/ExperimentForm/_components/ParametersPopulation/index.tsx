import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { useMemo } from 'react'
import { NoParametersRangeInput } from './NoParametersRangeInput'
import { DatasetSelector } from './DatasetSelector'
import { DatasetRowsInput } from './DatasetRowsInput'
import { ParametersSelection } from './ParametersSelection'
import {
  TabSelect,
  TabSelectOption,
} from '@latitude-data/web-ui/molecules/TabSelect'
import { TracesSelector } from './TracesSelector'

export function ParametersPopulationSettings(payload: ExperimentFormPayload) {
  const {
    parameters,
    selectedEvaluations,
    selectedParametersSource,
    setSelectedParametersSource,
  } = payload

  const requiresLabel = useMemo(
    () =>
      selectedEvaluations.some((evaluation) => {
        const specification = getEvaluationMetricSpecification(evaluation)
        return specification.requiresExpectedOutput
      }),
    [selectedEvaluations],
  )

  const sourceOptions = useMemo(() => {
    if (!requiresLabel && parameters.length === 0) {
      setSelectedParametersSource('manual')
      return []
    }

    const canUseManual = !requiresLabel && parameters.length === 0 // TODO: This can be improved to add hardcodded values for the parameters
    const canUseDataset = parameters.length > 0 || requiresLabel
    const canUseLogs = parameters.length > 0 && !requiresLabel

    setSelectedParametersSource((prev) => {
      if (prev === 'manual' && canUseManual) return prev
      if (prev === 'dataset' && canUseDataset) return prev
      if (prev === 'logs' && canUseLogs) return prev

      // Defaults when previous source is not available
      if (canUseDataset) return 'dataset'
      return 'manual'
    })

    return [
      canUseDataset && { label: 'From Dataset', value: 'dataset' as const },
      canUseLogs && { label: 'From History', value: 'logs' as const },
      canUseManual && { label: 'Manual', value: 'manual' as const },
    ].filter(Boolean) as TabSelectOption<'dataset' | 'logs' | 'manual'>[]
  }, [requiresLabel, parameters, setSelectedParametersSource])

  if (payload.isLoadingMetadata) {
    return <Skeleton className='h-6 w-2/3' />
  }

  return (
    <div className='flex flex-col gap-2 w-2/3'>
      {sourceOptions.length > 1 && (
        <TabSelect
          options={sourceOptions}
          value={selectedParametersSource}
          onChange={(value) =>
            setSelectedParametersSource(value as 'dataset' | 'logs' | 'manual')
          }
        />
      )}

      {selectedParametersSource === 'manual' && (
        <NoParametersRangeInput {...payload} />
      )}

      {selectedParametersSource === 'dataset' && (
        <>
          <DatasetSelector {...payload} />
          <DatasetRowsInput {...payload} />
          <ParametersSelection {...payload} />
        </>
      )}

      {selectedParametersSource === 'logs' && <TracesSelector {...payload} />}
    </div>
  )
}
