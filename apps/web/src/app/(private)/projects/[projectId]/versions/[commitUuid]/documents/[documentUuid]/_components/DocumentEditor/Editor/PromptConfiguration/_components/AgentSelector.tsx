import { FilePathSelector } from '@latitude-data/web-ui/molecules/FilepathSelector'
import { useMemo } from 'react'
import { PromptConfigurationProps, useLatitudeAgentsConfig } from '../utils'

export function SubAgentSelector({
  config,
  setConfig,
  disabled,
  canUseSubagents,
}: PromptConfigurationProps) {
  const { selectedAgents, availableAgents, toggleAgent } =
    useLatitudeAgentsConfig({ config, setConfig, canUseSubagents })

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
