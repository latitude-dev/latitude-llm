import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { ScheduleConfig, SimpleInterval } from './scheduleUtils'

export function SimpleScheduleForm({
  config,
  updateConfig,
  isLoading,
}: {
  config: ScheduleConfig
  updateConfig: (updater: (prev: ScheduleConfig) => ScheduleConfig) => void
  isLoading: boolean
}) {
  const handleSimpleIntervalChange = (interval: SimpleInterval) => {
    updateConfig((prev) => ({
      ...prev,
      simple: {
        ...prev.simple!,
        interval,
      },
    }))
  }

  const handleSimpleValueChange = (value: number) => {
    updateConfig((prev) => ({
      ...prev,
      simple: {
        ...prev.simple!,
        value: Math.max(1, value), // Ensure value is at least 1
      },
    }))
  }

  return (
    <div className='flex flex-row items-center gap-4'>
      <Input
        type='number'
        label='Every'
        min={1}
        value={config.simple?.value || 1}
        onChange={(e) =>
          handleSimpleValueChange(parseInt(e.target.value, 10) || 1)
        }
        disabled={isLoading}
      />

      <Select
        name='interval'
        label='Interval'
        value={config.simple?.interval || 'hour'}
        onChange={handleSimpleIntervalChange as any}
        disabled={isLoading}
        options={[
          { label: 'Minute(s)', value: 'minute' },
          { label: 'Hour(s)', value: 'hour' },
          { label: 'Day(s)', value: 'day' },
          { label: 'Week(s)', value: 'week' },
          { label: 'Month(s)', value: 'month' },
        ]}
      />
    </div>
  )
}
