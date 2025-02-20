import { useCallback, useMemo } from 'react'

import { LOG_SOURCES, LogSources } from '@latitude-data/core/browser'
import { Button, Checkbox, Text } from '@latitude-data/web-ui'

import { FilterButton, useFilterButtonColor } from '../FilterButton'

const LogSourceLabel: { [key in LogSources]: string } = {
  [LogSources.API]: 'API',
  [LogSources.Evaluation]: 'Evaluation',
  [LogSources.Playground]: 'Playground',
  [LogSources.User]: 'User',
  [LogSources.SharedPrompt]: 'Public prompts',
  [LogSources.AgentAsTool]: 'Sub agents',
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
