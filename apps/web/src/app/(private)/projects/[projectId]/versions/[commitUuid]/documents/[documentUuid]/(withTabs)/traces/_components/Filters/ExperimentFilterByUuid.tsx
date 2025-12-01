import { useCallback, useMemo } from 'react'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useFilterButtonColor, FilterButton } from '$/components/FilterButton'

function ExperimentCheckbox({
  experiment,
  selectedExperimentUuids,
  onSelectExperiments,
}: {
  experiment: ExperimentDto
  selectedExperimentUuids: string[]
  onSelectExperiments: (selectedExperimentUuids: string[]) => void
}) {
  const isSelected = useMemo(
    () => selectedExperimentUuids.includes(experiment.uuid),
    [selectedExperimentUuids, experiment],
  )

  const onSelect = useCallback(() => {
    onSelectExperiments(
      isSelected
        ? selectedExperimentUuids.filter((uuid) => uuid !== experiment.uuid)
        : [...selectedExperimentUuids, experiment.uuid],
    )
  }, [selectedExperimentUuids, experiment, isSelected, onSelectExperiments])

  return (
    <Checkbox
      checked={isSelected}
      onClick={onSelect}
      label={
        <Text.H5 noWrap ellipsis>
          {experiment.name}
        </Text.H5>
      }
    />
  )
}

function ExperimentsList({
  experiments,
  selectedExperimentUuids,
  onSelectExperiments,
}: {
  experiments: ExperimentDto[]
  selectedExperimentUuids: string[]
  onSelectExperiments: (selectedExperimentUuids: string[]) => void
}) {
  return (
    <div className='flex flex-col gap-2 w-full'>
      <Text.H5B>Experiments</Text.H5B>
      <ul className='flex flex-col gap-2 w-full'>
        {experiments.map((experiment) => (
          <li key={experiment.id}>
            <ExperimentCheckbox
              experiment={experiment}
              selectedExperimentUuids={selectedExperimentUuids}
              onSelectExperiments={onSelectExperiments}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ExperimentFilterByUuid({
  selectedExperimentUuids,
  onSelectExperiments,
  isDefault,
  reset,
  disabled,
  experiments,
}: {
  selectedExperimentUuids: string[]
  onSelectExperiments: (selectedExperimentUuids: string[]) => void
  isDefault: boolean
  reset: () => void
  disabled?: boolean
  experiments: ExperimentDto[]
}) {
  const sortedExperiments = useMemo(
    () =>
      [...experiments].sort((a, b) => {
        const aTime =
          a.createdAt instanceof Date
            ? a.createdAt.getTime()
            : a.createdAt
              ? new Date(a.createdAt).getTime()
              : 0
        const bTime =
          b.createdAt instanceof Date
            ? b.createdAt.getTime()
            : b.createdAt
              ? new Date(b.createdAt).getTime()
              : 0
        return bTime - aTime
      }),
    [experiments],
  )

  const filterLabel = useMemo(() => {
    if (isDefault) return 'All experiments'
    if (selectedExperimentUuids.length === 0) return 'No experiments selected'
    if (selectedExperimentUuids.length > 1) {
      return `${selectedExperimentUuids.length} experiments`
    }
    const selectedExperiment = experiments.find(
      (experiment) => experiment.uuid === selectedExperimentUuids[0],
    )
    return selectedExperiment?.name ?? '1 experiment'
  }, [isDefault, selectedExperimentUuids, experiments])

  const filterColor = useFilterButtonColor({
    isDefault,
    isSelected: selectedExperimentUuids.length > 0,
  })

  return (
    <FilterButton
      label={filterLabel}
      color={filterColor.color}
      darkColor={filterColor.darkColor}
    >
      <div className='flex flex-row gap-4 w-full flex-nowrap justify-end'>
        <Button
          size='none'
          variant='link'
          onClick={reset}
          disabled={disabled || isDefault}
        >
          Reset
        </Button>
      </div>
      <div className='flex flex-col gap-4'>
        <ExperimentsList
          experiments={sortedExperiments}
          selectedExperimentUuids={selectedExperimentUuids}
          onSelectExperiments={onSelectExperiments}
        />
      </div>
    </FilterButton>
  )
}
