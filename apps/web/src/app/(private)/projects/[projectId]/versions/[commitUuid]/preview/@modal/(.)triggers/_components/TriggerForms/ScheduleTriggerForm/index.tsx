import { useCallback } from 'react'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { SimpleScheduleForm } from './SimpleScheduleForm'
import { SpecificScheduleForm } from './SpecificScheduleForm'
import { CustomScheduleForm } from './CustomScheduleForm'
import {
  type ScheduleConfig,
  type ScheduleType,
  convertToCronExpression,
  getScheduleDescription,
} from './scheduleUtils'

export function ScheduleTriggerForm({
  config,
  setConfig,
  isExecuting,
}: {
  config: ScheduleConfig
  setConfig: (updater: (prev: ScheduleConfig) => ScheduleConfig) => void
  isExecuting: boolean
}) {
  const handleTypeChange = useCallback(
    (value: string) => {
      const type = value as ScheduleType
      setConfig((prev) => ({
        ...prev,
        type,
      }))
    },
    [setConfig],
  )

  return (
    <>
      <Select
        label='Schedule Type'
        name='scheduleType'
        value={config.type}
        onChange={handleTypeChange}
        disabled={isExecuting}
        options={[
          { label: 'Simple Interval', value: 'simple' },
          { label: 'Specific Days & Times', value: 'specific' },
          { label: 'Custom (Cron)', value: 'custom' },
        ]}
      />

      {config.type === 'simple' && (
        <SimpleScheduleForm config={config} updateConfig={setConfig} isLoading={isExecuting} />
      )}

      {config.type === 'specific' && (
        <SpecificScheduleForm config={config} updateConfig={setConfig} isLoading={isExecuting} />
      )}

      {config.type === 'custom' && (
        <CustomScheduleForm config={config} updateConfig={setConfig} isLoading={isExecuting} />
      )}

      <div className='p-3 bg-muted rounded-md flex flex-col gap-1'>
        <Text.H6>
          <Text.H6B>Schedule:</Text.H6B> {getScheduleDescription(config)}
        </Text.H6>
        <Text.H6 color='foregroundMuted'>
          Cron expression: {convertToCronExpression(config)}
        </Text.H6>
      </div>
    </>
  )
}
