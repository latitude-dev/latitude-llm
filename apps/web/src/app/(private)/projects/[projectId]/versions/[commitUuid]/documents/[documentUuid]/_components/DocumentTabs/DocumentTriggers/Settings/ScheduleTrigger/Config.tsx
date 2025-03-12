import { useState } from 'react'
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  Text,
} from '@latitude-data/web-ui'

type ScheduleType = 'simple' | 'custom' | 'specific'
type SimpleInterval = 'minute' | 'hour' | 'day' | 'week' | 'month'
type WeekDay =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'

// Internal UI configuration
interface ScheduleConfig {
  type: ScheduleType
  simple?: {
    interval: SimpleInterval
    value: number
  }
  custom?: {
    expression: string
  }
  specific?: {
    days: WeekDay[]
    time: string // HH:mm format
    interval: number // every X occurrences
  }
  enabled: boolean
}

// Final configuration to be saved
interface SavedConfig {
  cronExpression: string
  enabled: boolean
}

const DEFAULT_CONFIG: ScheduleConfig = {
  type: 'simple',
  simple: {
    interval: 'hour',
    value: 1,
  },
  specific: {
    days: ['monday'],
    time: '09:00',
    interval: 1,
  },
  enabled: true,
}

const WEEKDAYS: { label: string; value: WeekDay }[] = [
  { label: 'Sunday', value: 'sunday' },
  { label: 'Monday', value: 'monday' },
  { label: 'Tuesday', value: 'tuesday' },
  { label: 'Wednesday', value: 'wednesday' },
  { label: 'Thursday', value: 'thursday' },
  { label: 'Friday', value: 'friday' },
  { label: 'Saturday', value: 'saturday' },
]

// Map weekday names to cron day numbers (0-6, where 0 is Sunday)
const WEEKDAY_TO_CRON: Record<WeekDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

export function ScheduleTriggerConfig({
  onChangeConfig,
  isLoading,
}: {
  onChangeConfig: (config?: SavedConfig) => void
  isLoading: boolean
}) {
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG)
  const [isDirty, setIsDirty] = useState(false)

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

  const handleCustomExpressionChange = (expression: string) => {
    updateConfig((prev) => ({
      ...prev,
      custom: {
        expression,
      },
    }))
  }

  const handleEnabledChange = (enabled: boolean) => {
    updateConfig((prev) => ({
      ...prev,
      enabled,
    }))
  }

  const handleDayToggle = (day: WeekDay) => {
    updateConfig((prev) => {
      const currentDays = prev.specific?.days || []
      const newDays = currentDays.includes(day)
        ? currentDays.filter((d) => d !== day)
        : [...currentDays, day]

      return {
        ...prev,
        specific: {
          ...prev.specific!,
          days: newDays.length > 0 ? newDays : [day], // Ensure at least one day is selected
        },
      }
    })
  }

  const handleTimeChange = (time: string) => {
    updateConfig((prev) => ({
      ...prev,
      specific: {
        ...prev.specific!,
        time,
      },
    }))
  }

  const handleIntervalChange = (interval: number) => {
    updateConfig((prev) => ({
      ...prev,
      specific: {
        ...prev.specific!,
        interval: Math.max(1, interval), // Ensure interval is at least 1
      },
    }))
  }

  // Convert the current UI configuration to a cron expression
  const convertToCronExpression = (): string => {
    if (config.type === 'custom' && config.custom) {
      // For custom type, use the expression directly
      return config.custom.expression
    } else if (config.type === 'specific' && config.specific) {
      // For specific days and times
      const { days, time, interval } = config.specific
      const [hours, minutes] = time.split(':').map(Number)

      // Handle the interval for specific days
      if (interval > 1) {
        // For intervals > 1, we need to use a more complex approach
        // We'll use the day of month with a step value to approximate the interval
        // This is an approximation as cron doesn't directly support "every X occurrences"
        const daysList = days.map((day) => WEEKDAY_TO_CRON[day]).join(',')

        // Create cron expression that runs on the specified days but with a day-of-month step
        // This will run on the specified weekdays, but only when the day of month matches the step
        return `${minutes} ${hours} */${interval} * ${daysList}`
      } else {
        // For interval = 1 (every occurrence), use the standard format
        const daysList = days.map((day) => WEEKDAY_TO_CRON[day]).join(',')
        return `${minutes} ${hours} * * ${daysList}`
      }
    } else if (config.type === 'simple' && config.simple) {
      // For simple intervals
      const { interval, value } = config.simple

      switch (interval) {
        case 'minute':
          // Every X minutes: */X * * * *
          return value === 1 ? '* * * * *' : `*/${value} * * * *`
        case 'hour':
          // Every X hours: 0 */X * * *
          return value === 1 ? '0 * * * *' : `0 */${value} * * *`
        case 'day':
          // Every X days: 0 0 */X * *
          return value === 1 ? '0 0 * * *' : `0 0 */${value} * *`
        case 'week':
          // Every X weeks (approximated as every X*7 days): 0 0 */X7 * *
          return value === 1 ? '0 0 * * 1' : `0 0 1-31/${value * 7} * *`
        case 'month':
          // Every X months: 0 0 1 */X *
          return value === 1 ? '0 0 1 * *' : `0 0 1 */${value} *`
        default:
          return '* * * * *'
      }
    }

    // Default fallback
    return '* * * * *'
  }

  const handleSave = () => {
    const cronExpression = convertToCronExpression()

    // Create the saved configuration with only cronExpression and enabled properties
    const savedConfig: SavedConfig = {
      cronExpression,
      enabled: config.enabled,
    }

    onChangeConfig(savedConfig)
    setIsDirty(false)
  }

  // Generate human-readable description of the schedule
  const getScheduleDescription = () => {
    if (config.type === 'simple' && config.simple) {
      const { interval, value } = config.simple
      if (value === 1) {
        return `Every ${interval}`
      } else {
        return `Every ${value} ${interval}s`
      }
    } else if (config.type === 'custom' && config.custom) {
      return `Custom schedule: ${config.custom.expression}`
    } else if (config.type === 'specific' && config.specific) {
      const { days, time, interval } = config.specific
      const dayNames = days
        .map((day) => day.charAt(0).toUpperCase() + day.slice(1))
        .join(', ')

      const intervalText =
        interval > 1 ? `every ${interval} occurrences` : 'every occurrence'

      return `At ${time} on ${dayNames}, ${intervalText}`
    }
    return ''
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
      )}

      {config.type === 'specific' && (
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label>Select Day(s)</Label>
            <div className='flex flex-wrap gap-2'>
              {WEEKDAYS.map((day) => (
                <Button
                  key={day.value}
                  variant={
                    config.specific?.days.includes(day.value)
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() => handleDayToggle(day.value)}
                  disabled={isLoading}
                  className='px-3 py-1'
                >
                  {day.label.substring(0, 3)}
                </Button>
              ))}
            </div>
          </div>

          <div className='flex flex-row gap-4'>
            <Input
              label='Time (HH:MM)'
              type='time'
              value={config.specific?.time || '09:00'}
              onChange={(e) => handleTimeChange(e.target.value)}
              disabled={isLoading}
            />

            <Input
              label='Repeat every'
              type='number'
              min={1}
              value={config.specific?.interval || 1}
              onChange={(e) =>
                handleIntervalChange(parseInt(e.target.value, 10) || 1)
              }
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      {config.type === 'custom' && (
        <Input
          name='cron-expression'
          label='Cron Expression'
          description='Format: minute hour day month weekday (e.g., "0 * * * *" for every hour)'
          placeholder='* * * * *'
          value={config.custom?.expression || ''}
          onChange={(e) => handleCustomExpressionChange(e.target.value)}
          disabled={isLoading}
        />
      )}

      <div className='p-3 bg-muted rounded-md flex flex-col gap-1'>
        <Text.H6>
          <Text.H6B>Schedule:</Text.H6B> {getScheduleDescription()}
        </Text.H6>
        {!config.enabled && (
          <Text.H6 color='accent'>This schedule is currently disabled</Text.H6>
        )}
        <Text.H6 color='foregroundMuted'>
          Cron expression: {convertToCronExpression()}
        </Text.H6>
      </div>

      <div className='flex justify-end'>
        <Button onClick={handleSave} disabled={isLoading || !isDirty}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}
