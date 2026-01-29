'use client'

import useFeature from '$/stores/useFeature'
import {
  MAX_SIMULATION_TURNS,
  SimulationSettings,
} from '@latitude-data/constants/simulation'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { useCallback, useMemo } from 'react'

const DEFAULT_MAX_TURNS = 4

function GoalSetting() {
  return (
    <div className='w-full h-full flex flex-col gap-2'>
      <Text.H5M>User goal and behaviour</Text.H5M>
      <Text.H6 color='foregroundMuted'>
        Define the goal and behaviour for the simulated user. This will be used
        to guide the simulated user's behaviour, and to help the simulation
        decide when to stop.
      </Text.H6>
      <TextArea
        disabled={true}
        minRows={3}
        maxRows={10}
        autoGrow={true}
        placeholder='WIP'
      />
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
}: {
  value?: SimulationSettings
  onChange: (settings: SimulationSettings) => void
  disabled?: boolean
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
              <GoalSetting />
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
