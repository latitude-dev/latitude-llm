'use client'

import useFeature from '$/stores/useFeature'
import {
  MAX_SIMULATION_TURNS,
  SimulatedUserGoalSource,
  SimulationSettings,
} from '@latitude-data/constants/simulation'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { useCallback, useMemo } from 'react'

const DEFAULT_MAX_TURNS = 4

const CUSTOM_GOAL_VALUE = '__custom__'

type GoalSelectValue = typeof CUSTOM_GOAL_VALUE | number

function GoalSetting({
  value,
  onChange,
  disabled,
  isDatasetSource,
  datasetColumns,
}: {
  value: SimulatedUserGoalSource | undefined
  onChange: (value: SimulatedUserGoalSource | undefined) => void
  disabled?: boolean
  isDatasetSource?: boolean
  datasetColumns?: SelectOption<number>[]
}) {
  const hasDatasetColumns = datasetColumns && datasetColumns.length > 0
  const showColumnSelector = isDatasetSource === true

  const selectOptions: SelectOption<GoalSelectValue>[] = useMemo(() => {
    const customOption: SelectOption<GoalSelectValue> = {
      label: 'Write custom goal...',
      value: CUSTOM_GOAL_VALUE,
      icon: 'pencil',
    }

    if (!hasDatasetColumns) {
      const infoOption: SelectOption<GoalSelectValue> = {
        label: 'Select a dataset to use column values',
        value: '__info__' as GoalSelectValue,
        disabled: true,
      }
      return [customOption, infoOption]
    }

    const columnOptions: SelectOption<GoalSelectValue>[] = datasetColumns.map(
      (col) => ({
        label: col.label,
        value: col.value,
        icon: col.icon,
      }),
    )

    return [customOption, ...columnOptions]
  }, [hasDatasetColumns, datasetColumns])

  const selectedValue: GoalSelectValue = useMemo(() => {
    if (!value || value.type === 'global') return CUSTOM_GOAL_VALUE
    return value.columnIndex
  }, [value])

  const isCustomSelected =
    !showColumnSelector || selectedValue === CUSTOM_GOAL_VALUE

  const handleSelectChange = useCallback(
    (newValue: GoalSelectValue) => {
      if (newValue === CUSTOM_GOAL_VALUE) {
        const currentGlobalValue = value?.type === 'global' ? value.value : ''
        onChange({ type: 'global', value: currentGlobalValue })
      } else {
        onChange({ type: 'column', columnIndex: newValue as number })
      }
    },
    [onChange, value],
  )

  const handleTextChange = useCallback(
    (newValue: string) => {
      onChange({ type: 'global', value: newValue })
    },
    [onChange],
  )

  const globalValue = value?.type === 'global' ? value.value : ''

  return (
    <div className='w-full h-full flex flex-col gap-2'>
      <Text.H5M>User goal and behaviour</Text.H5M>
      <Text.H6 color='foregroundMuted'>
        Define the goal and behaviour for the simulated user. This will be used
        to guide the simulated user's behaviour, and to help the simulation
        decide when to stop.
      </Text.H6>
      {showColumnSelector && (
        <Select
          name='goalSource'
          options={selectOptions}
          value={selectedValue}
          onChange={handleSelectChange}
          placeholder='Select goal source'
          disabled={disabled}
        />
      )}
      {isCustomSelected && (
        <TextArea
          minRows={3}
          maxRows={10}
          autoGrow={true}
          placeholder='Describe the goal and behaviour for the simulated user...'
          value={globalValue}
          onChange={(e) => handleTextChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  )
}

function ConversationTurnsSetting({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const values = useMemo(() => [value], [value]) // This is made to avoid generating a new array on every render

  return (
    <div className='w-full h-full flex flex-col gap-2'>
      <Text.H5M>Maximum number of turns</Text.H5M>
      <Text.H6 color='foregroundMuted'>
        The maximum number of turns to simulate between your agent and the
        simulated user.
      </Text.H6>
      <div className='flex flex-row gap-2'>
        <Slider
          className='flex-grow min-w-0'
          value={values}
          onValueChange={(values) => onChange(values[0])}
          min={2}
          max={MAX_SIMULATION_TURNS}
          step={1}
          disabled={disabled}
        />
        <Text.H5B color='primary' noWrap>
          {value} turns
        </Text.H5B>
      </div>
    </div>
  )
}

export function ConversationSimulationSettings({
  value = {},
  onChange,
  disabled,
  isDatasetSource,
  datasetColumns,
}: {
  value?: SimulationSettings
  onChange: (settings: SimulationSettings) => void
  disabled?: boolean
  isDatasetSource?: boolean
  datasetColumns?: SelectOption<number>[]
}) {
  const { isEnabled: isMultiTurnSimulationsEnabled } = useFeature(
    'multiTurnSimulations',
  )

  const simulateConversation = useMemo(() => {
    if (!value.maxTurns) return false
    return value.maxTurns > 1
  }, [value.maxTurns])

  const handleEnableConversationSimulation = useCallback(
    (enabled: boolean) => {
      if (enabled) onChange({ ...value, maxTurns: DEFAULT_MAX_TURNS })
      else onChange({ ...value, maxTurns: undefined })
    },
    [value, onChange],
  )

  if (!isMultiTurnSimulationsEnabled) {
    return null
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row items-center justify-between gap-2'>
        <div className='flex flex-row items-center gap-2'>
          <div className='flex w-10 h-10 items-center justify-center bg-success-muted rounded-md'>
            <Icon name='chat' color='successMutedForeground' size='medium' />
          </div>
          <div className='flex flex-col'>
            <Text.H4>Simulate user responses</Text.H4>
            <Text.H6 color='foregroundMuted'>
              Generate responses as a simulated user, good for evaluating
              chatbots.
            </Text.H6>
          </div>
        </div>
        <SwitchToggle
          checked={simulateConversation}
          onCheckedChange={handleEnableConversationSimulation}
          disabled={disabled}
        />
      </div>
      {simulateConversation && (
        <CollapsibleBox
          title='Conversation simulation settings'
          icon='chat'
          scrollable={false}
          expandedContent={
            <div className='w-full h-full flex flex-col gap-4'>
              <GoalSetting
                value={value.simulatedUserGoalSource}
                onChange={(goalSource) =>
                  onChange({ ...value, simulatedUserGoalSource: goalSource })
                }
                disabled={disabled}
                isDatasetSource={isDatasetSource}
                datasetColumns={datasetColumns}
              />
              <ConversationTurnsSetting
                value={value.maxTurns ?? DEFAULT_MAX_TURNS}
                onChange={(maxTurns) => onChange({ ...value, maxTurns })}
                disabled={disabled}
              />
            </div>
          }
        />
      )}
    </div>
  )
}
