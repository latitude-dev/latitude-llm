'use client'

import { useCallback, useMemo } from 'react'

import { LogSources } from '@latitude-data/core/browser'
import { Button, Checkbox, Text } from '@latitude-data/web-ui'

import { FilterButton } from './FilterButton'

const LogSourceLabel: { [key in LogSources]: string } = {
  [LogSources.API]: 'API',
  [LogSources.Evaluation]: 'Evaluation',
  [LogSources.Playground]: 'Playground',
  [LogSources.User]: 'User',
  [LogSources.SharedPrompt]: 'Shared Prompt',
}

function LogSourceCheckbox({
  logSource,
  selectedLogSources,
  setSelectedLogSources,
}: {
  logSource: LogSources
  selectedLogSources: LogSources[]
  setSelectedLogSources: (selectedLogSources: LogSources[]) => void
}) {
  const isSelected = useMemo(
    () => selectedLogSources.includes(logSource),
    [selectedLogSources, logSource],
  )

  const onSelect = useCallback(() => {
    setSelectedLogSources(
      isSelected
        ? selectedLogSources.filter((origin) => origin !== logSource)
        : [...selectedLogSources, logSource],
    )
  }, [selectedLogSources, logSource, isSelected])

  return (
    <Button variant='ghost' fullWidth className='p-0' onClick={onSelect}>
      <div className='flex flex-row w-full justify-start gap-2'>
        <Checkbox checked={isSelected} fullWidth={false} />
        <Text.H5 noWrap ellipsis>
          {LogSourceLabel[logSource]}
        </Text.H5>
      </div>
    </Button>
  )
}

export function LogSourceFilter({
  selectedLogSources,
  setSelectedLogSources,
  reset,
}: {
  selectedLogSources: LogSources[]
  setSelectedLogSources: (selectedOrigins: LogSources[]) => void
  reset: () => void
}) {
  const label = useMemo(() => {
    if (!selectedLogSources.length) return 'Origins'
    if (selectedLogSources.length > 1) {
      return `${selectedLogSources.length} origins`
    }

    return LogSourceLabel[selectedLogSources[0]!]
  }, [selectedLogSources])

  const headerState = useMemo(() => {
    if (selectedLogSources.length === 0) return false
    if (selectedLogSources.length === Object.keys(LogSources).length)
      return true
    return 'indeterminate'
  }, [selectedLogSources])

  return (
    <FilterButton label={label} isActive={!!selectedLogSources.length}>
      <div className='flex flex-row gap-4 w-full flex-nowrap'>
        <Button
          variant='ghost'
          fullWidth
          className='p-0'
          onClick={() =>
            setSelectedLogSources(headerState ? [] : Object.values(LogSources))
          }
        >
          <div className='flex flex-row w-full justify-start gap-2'>
            <Checkbox checked={headerState} fullWidth={false} />
            {selectedLogSources.length} selected
          </div>
        </Button>

        <Button variant='link' className='p-0' onClick={reset}>
          Reset
        </Button>
      </div>
      <ul className='flex flex-col gap-2 pr-4'>
        {Object.values(LogSources).map((logSource) => (
          <li key={logSource}>
            <LogSourceCheckbox
              logSource={logSource}
              selectedLogSources={selectedLogSources}
              setSelectedLogSources={setSelectedLogSources}
            />
          </li>
        ))}
      </ul>
    </FilterButton>
  )
}
