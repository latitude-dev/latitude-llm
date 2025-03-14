import { useState } from 'react'
import {
  Button,
  Checkbox,
  Select,
  Text,
  useCurrentCommit,
} from '@latitude-data/web-ui'
import { SimpleScheduleForm } from './SimpleScheduleForm'
import { SpecificScheduleForm } from './SpecificScheduleForm'
import { CustomScheduleForm } from './CustomScheduleForm'
import {
  ScheduleConfig,
  SavedConfig,
  ScheduleType,
  DEFAULT_CONFIG,
  convertToCronExpression,
  getScheduleDescription,
} from './scheduleUtils'

export function ScheduleTriggerConfig({
  onChangeConfig,
  isLoading,
}: {
  onChangeConfig: (config?: SavedConfig) => void
  isLoading: boolean
}) {
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG)
  const [isDirty, setIsDirty] = useState(false)
  const { isHead } = useCurrentCommit()
  const canEdit = isHead && !isLoading

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

  const handleEnabledChange = (enabled: boolean) => {
    updateConfig((prev) => ({
      ...prev,
      enabled,
    }))
  }

  const handleSave = () => {
    const cronExpression = convertToCronExpression(config)

    // Create the saved configuration with only cronExpression and enabled properties
    const savedConfig: SavedConfig = {
      cronExpression,
      enabled: config.enabled,
    }

    onChangeConfig(savedConfig)
    setIsDirty(false)
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-2'>
        <Checkbox
          checked={config.enabled}
          onCheckedChange={handleEnabledChange}
          label='Enabled'
          disabled={isLoading}
        />
      </div>

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
        <SimpleScheduleForm
          config={config}
          updateConfig={updateConfig}
          isLoading={isLoading}
        />
      )}

      {config.type === 'specific' && (
        <SpecificScheduleForm
          config={config}
          updateConfig={updateConfig}
          isLoading={isLoading}
        />
      )}

      {config.type === 'custom' && (
        <CustomScheduleForm
          config={config}
          updateConfig={updateConfig}
          isLoading={isLoading}
        />
      )}

      <div className='p-3 bg-muted rounded-md flex flex-col gap-1'>
        <Text.H6>
          <Text.H6B>Schedule:</Text.H6B> {getScheduleDescription(config)}
        </Text.H6>
        {!config.enabled && (
          <Text.H6 color='accent'>This schedule is currently disabled</Text.H6>
        )}
        <Text.H6 color='foregroundMuted'>
          Cron expression: {convertToCronExpression(config)}
        </Text.H6>
      </div>

      <div className='flex justify-end'>
        <Button
          fancy
          onClick={handleSave}
          disabled={!canEdit || isLoading || !isDirty}
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}
