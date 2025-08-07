import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { SimpleScheduleForm } from './SimpleScheduleForm'
import { SpecificScheduleForm } from './SpecificScheduleForm'
import { CustomScheduleForm } from './CustomScheduleForm'
import {
  type ScheduleConfig,
  type SavedConfig,
  type ScheduleType,
  DEFAULT_CONFIG,
  convertToCronExpression,
  getScheduleDescription,
} from './scheduleUtils'
import type { ScheduledTriggerConfiguration } from '@latitude-data/constants/documentTriggers'

// Convert ScheduledTriggerConfiguration to ScheduleConfig
function convertToScheduleConfig(triggerConfig?: ScheduledTriggerConfiguration): ScheduleConfig {
  if (!triggerConfig) {
    return DEFAULT_CONFIG
  }

  // Create a custom schedule config with the cron expression
  return {
    ...DEFAULT_CONFIG,
    type: 'custom',
    custom: {
      expression: triggerConfig.cronExpression,
    },
  }
}

export function ScheduleTriggerConfig({
  canDestroy = false,
  onChangeConfig,
  isLoading,
  initialConfig,
}: {
  canDestroy: boolean
  onChangeConfig: (config?: SavedConfig) => void
  isLoading: boolean
  initialConfig?: ScheduledTriggerConfiguration
}) {
  const [config, setConfig] = useState<ScheduleConfig>(convertToScheduleConfig(initialConfig))
  const [isDirty, setIsDirty] = useState(false)
  const { commit } = useCurrentCommit()
  const disabled = !!commit.mergedAt || isLoading

  const updateConfig = (updater: (prev: ScheduleConfig) => ScheduleConfig) => {
    setConfig(updater)
    setIsDirty(true)
  }

  const handleTypeChange = (value: string) => {
    const type = value as ScheduleType
    updateConfig((prev) => ({
      ...prev,
      type,
    }))
  }

  const handleDestroy = () => {
    onChangeConfig(undefined)
    setIsDirty(false)
  }

  const handleSave = () => {
    const cronExpression = convertToCronExpression(config)

    const savedConfig: SavedConfig = {
      cronExpression,
    }

    onChangeConfig(savedConfig)
    setIsDirty(false)
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-2'>
        <Select
          label='Schedule Type'
          name='scheduleType'
          value={config.type}
          onChange={handleTypeChange as any}
          disabled={isLoading}
          options={[
            { label: 'Simple Interval', value: 'simple' },
            { label: 'Specific Days & Times', value: 'specific' },
            { label: 'Custom (Cron)', value: 'custom' },
          ]}
        />
      </div>

      {config.type === 'simple' && (
        <SimpleScheduleForm config={config} updateConfig={updateConfig} isLoading={isLoading} />
      )}

      {config.type === 'specific' && (
        <SpecificScheduleForm config={config} updateConfig={updateConfig} isLoading={isLoading} />
      )}

      {config.type === 'custom' && (
        <CustomScheduleForm config={config} updateConfig={updateConfig} isLoading={isLoading} />
      )}

      <div className='p-3 bg-muted rounded-md flex flex-col gap-1'>
        <Text.H6>
          <Text.H6B>Schedule:</Text.H6B> {getScheduleDescription(config)}
        </Text.H6>
        <Text.H6 color='foregroundMuted'>
          Cron expression: {convertToCronExpression(config)}
        </Text.H6>
      </div>

      <div className='flex justify-end gap-2'>
        <Button
          fancy
          variant='destructive'
          onClick={handleDestroy}
          disabled={disabled || isLoading || !canDestroy}
        >
          Remove
        </Button>
        <Button fancy onClick={handleSave} disabled={disabled || isLoading || !isDirty}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}
