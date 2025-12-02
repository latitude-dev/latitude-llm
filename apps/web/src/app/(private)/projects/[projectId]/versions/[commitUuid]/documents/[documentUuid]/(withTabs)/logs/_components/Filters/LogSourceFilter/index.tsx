import { useCallback, useMemo } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { FilterButton, useFilterButtonColor } from '../FilterButton'
import { LOG_SOURCES, LogSources } from '@latitude-data/core/constants'

const LogSourceLabel: { [key in LogSources]: string } = {
  [LogSources.API]: 'API',
  [LogSources.AgentAsTool]: 'Sub agents',
  [LogSources.Copilot]: 'Latitude Copilot',
  [LogSources.EmailTrigger]: 'Email trigger',
  [LogSources.IntegrationTrigger]: 'Integration trigger',
  [LogSources.Evaluation]: 'Evaluation',
  [LogSources.Experiment]: 'Experiment',
  [LogSources.Playground]: 'Playground',
  [LogSources.ScheduledTrigger]: 'Scheduled trigger',
  [LogSources.SharedPrompt]: 'Public prompts',
  [LogSources.User]: 'User',
  [LogSources.ABTestBaseline]: 'A/B baseline',
  [LogSources.ABTestChallenger]: 'A/B Challenger',
  [LogSources.ShadowTest]: 'Shadow test',
}

function LogSourceCheckbox({
  logSource,
  selectedLogSources,
  onSelectLogSources,
}: {
  logSource: LogSources
  selectedLogSources: LogSources[]
  onSelectLogSources: (selectedLogSources: LogSources[]) => void
}) {
  const isSelected = useMemo(
    () => selectedLogSources.includes(logSource),
    [selectedLogSources, logSource],
  )

  const onSelect = useCallback(() => {
    onSelectLogSources(
      isSelected
        ? selectedLogSources.filter((origin) => origin !== logSource)
        : [...selectedLogSources, logSource],
    )
  }, [selectedLogSources, logSource, isSelected, onSelectLogSources])

  return (
    <Checkbox
      checked={isSelected}
      onCheckedChange={onSelect}
      label={
        <Text.H5 noWrap ellipsis>
          {LogSourceLabel[logSource]}
        </Text.H5>
      }
    />
  )
}

export function LogSourceFilter({
  selectedLogSources,
  onSelectLogSources,
  isDefault,
  reset,
}: {
  selectedLogSources: LogSources[]
  onSelectLogSources: (selectedOrigins: LogSources[]) => void
  isDefault: boolean
  reset: () => void
}) {
  const headerState = useMemo(() => {
    if (selectedLogSources.length === 0) return false
    if (selectedLogSources.length === Object.keys(LogSources).length)
      return true
    return 'indeterminate'
  }, [selectedLogSources])

  const filterLabel = useMemo(() => {
    if (isDefault) return 'Any origin'
    if (selectedLogSources.length === 0) return 'No origins selected'
    if (selectedLogSources.length > 1) {
      return `${selectedLogSources.length} origins`
    }
    return LogSourceLabel[selectedLogSources[0]!]
  }, [isDefault, selectedLogSources])

  const filterColor = useFilterButtonColor({
    isDefault,
    isSelected: selectedLogSources.length > 0,
  })

  return (
    <FilterButton
      label={filterLabel}
      color={filterColor.color}
      darkColor={filterColor.darkColor}
    >
      <div className='flex flex-row gap-4 w-full flex-nowrap'>
        <Checkbox
          checked={headerState}
          onCheckedChange={() =>
            onSelectLogSources(headerState ? [] : LOG_SOURCES)
          }
          label={
            <Text.H5 noWrap ellipsis>
              {selectedLogSources.length} selected
            </Text.H5>
          }
        />

        <Button size='none' variant='link' onClick={reset} disabled={isDefault}>
          Reset
        </Button>
      </div>
      <ul className='flex flex-col gap-2'>
        {LOG_SOURCES.map((logSource) => (
          <li key={logSource}>
            <LogSourceCheckbox
              logSource={logSource}
              selectedLogSources={selectedLogSources}
              onSelectLogSources={onSelectLogSources}
            />
          </li>
        ))}
      </ul>
    </FilterButton>
  )
}
