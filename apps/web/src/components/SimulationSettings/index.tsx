'use client'

import { SimulationSettings } from '@latitude-data/constants/simulation'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { ToolSimulationSettings } from './ToolSimulation'
import { ConversationSimulationSettings } from './ConversationSimulation'

export type SimulationSettingsProps = {
  value?: SimulationSettings
  onChange: (settings: SimulationSettings) => void
  disabled?: boolean
  isDatasetSource?: boolean
  datasetColumns?: SelectOption<number>[]
}

export function SimulationSettingsPanel({
  value = {},
  onChange,
  disabled,
  isDatasetSource,
  datasetColumns,
}: SimulationSettingsProps) {
  return (
    <div className='flex flex-col gap-4'>
      <ConversationSimulationSettings
        value={value}
        onChange={onChange}
        disabled={disabled}
        isDatasetSource={isDatasetSource}
        datasetColumns={datasetColumns}
      />
      <ToolSimulationSettings
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
