import { FilePathSelector } from '@latitude-data/web-ui'
import { PromptConfigurationProps, useLatitudeAgentsConfig } from '../utils'
import { useMemo } from 'react'

export function SubAgentSelector({
  config,
  setConfig,
  disabled,
}: PromptConfigurationProps) {
  const { selectedAgents, availableAgents, toggleAgent } =
    useLatitudeAgentsConfig({ config, setConfig })

  const label = useMemo(() => {
    if (!selectedAgents.length) return 'No agents selected'
    if (selectedAgents.length === 1) return selectedAgents[0]!
    return `${selectedAgents.length} agents selected`
  }, [selectedAgents])

  return (
    <FilePathSelector
      label={label}
      filepaths={availableAgents}
      selected={selectedAgents}
      onSelect={toggleAgent}
      notFoundMessage='No agents found'
      disabled={disabled}
    />
  )
}
