import { SimulationSettingsPanel } from '$/components/SimulationSettings'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { useCallback, useEffect } from 'react'
import { ExperimentFormPayload } from '../useExperimentFormPayload'
import { useLabels } from './useLabels'

export function ExperimentSimulationSettings(payload: ExperimentFormPayload) {
  const { labels, buildLabels } = useLabels()

  useEffect(() => {
    if (!payload.selectedDataset) return
    buildLabels(payload.selectedDataset)
  }, [payload.selectedDataset, buildLabels])

  const handleChange = useCallback(
    (settings: SimulationSettings) => {
      payload.setSimulationSettings(settings)
    },
    [payload],
  )

  const isDatasetSource = payload.selectedParametersSource === 'dataset'

  return (
    <div className='flex flex-col gap-4 w-2/3'>
      <SimulationSettingsPanel
        value={payload.simulationSettings}
        onChange={handleChange}
        isDatasetSource={isDatasetSource}
        datasetColumns={isDatasetSource ? labels : undefined}
      />
    </div>
  )
}
