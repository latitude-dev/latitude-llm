import { useState, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
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
  onSaveTrigger,
  isCreating,
}: {
  onSaveTrigger: (config: SavedConfig) => void
  isCreating: boolean
}) {
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG)
  const handleTypeChange = useCallback((value: string) => {
    const type = value as ScheduleType
    setConfig((prev) => ({
      ...prev,
      type,
    }))
  }, [])

  const handleSave = useCallback(() => {
    onSaveTrigger({ cronExpression: convertToCronExpression(config) })
  }, [config, onSaveTrigger])
  return (
    <>
      <Select
        label='Schedule Type'
        name='scheduleType'
        value={config.type}
        onChange={handleTypeChange}
        disabled={isCreating}
        options={[
          { label: 'Simple Interval', value: 'simple' },
          { label: 'Specific Days & Times', value: 'specific' },
          { label: 'Custom (Cron)', value: 'custom' },
        ]}
      />

      {config.type === 'simple' && (
        <SimpleScheduleForm
          config={config}
          updateConfig={setConfig}
          isLoading={isCreating}
        />
      )}

      {config.type === 'specific' && (
        <SpecificScheduleForm
          config={config}
          updateConfig={setConfig}
          isLoading={isCreating}
        />
      )}

      {config.type === 'custom' && (
        <CustomScheduleForm
          config={config}
          updateConfig={setConfig}
          isLoading={isCreating}
        />
      )}

      <div className='p-3 bg-muted rounded-md flex flex-col gap-1'>
        <Text.H6>
          <Text.H6B>Schedule:</Text.H6B> {getScheduleDescription(config)}
        </Text.H6>
        <Text.H6 color='foregroundMuted'>
          Cron expression: {convertToCronExpression(config)}
        </Text.H6>
      </div>

      <Button fancy onClick={handleSave} disabled={isCreating}>
        {isCreating ? 'Creating trigger...' : 'Create trigger'}
      </Button>
    </>
  )
}
