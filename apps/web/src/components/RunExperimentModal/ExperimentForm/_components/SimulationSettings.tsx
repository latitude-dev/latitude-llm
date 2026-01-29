import { SimulationSettingsPanel } from '$/components/SimulationSettings'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { useCallback } from 'react'
import { ExperimentFormPayload } from '../useExperimentFormPayload'

export function ExperimentSimulationSettings(payload: ExperimentFormPayload) {
  const handleChange = useCallback(
    (settings: SimulationSettings) => {
      payload.setSimulationSettings(settings)
    },
    [payload],
  )

  return (
    <div className='flex flex-col gap-4 w-2/3'>
      <SimulationSettingsPanel
        value={payload.simulationSettings}
        onChange={handleChange}
      />
    </div>
  )
}
