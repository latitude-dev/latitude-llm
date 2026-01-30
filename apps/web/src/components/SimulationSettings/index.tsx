'use client'

import { SimulationSettings } from '@latitude-data/constants/simulation'
import { ToolSimulationSettings } from './ToolSimulation'
import { ConversationSimulationSettings } from './ConversationSimulation'

export type SimulationSettingsProps = {
  value?: SimulationSettings
  onChange: (settings: SimulationSettings) => void
  disabled?: boolean
}

export function SimulationSettingsPanel({
  value = {},
  onChange,
  disabled,
}: SimulationSettingsProps) {
  return (
    <div className='flex flex-col gap-4'>
      <ConversationSimulationSettings
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <ToolSimulationSettings
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
