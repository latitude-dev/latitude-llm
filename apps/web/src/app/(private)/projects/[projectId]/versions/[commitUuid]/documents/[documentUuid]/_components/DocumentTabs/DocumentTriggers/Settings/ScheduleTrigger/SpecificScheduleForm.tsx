import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { ScheduleConfig, WeekDay, WEEKDAYS } from './scheduleUtils'

interface SpecificScheduleFormProps {
  config: ScheduleConfig
  updateConfig: (updater: (prev: ScheduleConfig) => ScheduleConfig) => void
  isLoading: boolean
}

export function SpecificScheduleForm({
  config,
  updateConfig,
  isLoading,
}: SpecificScheduleFormProps) {
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

  return (
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
  )
}
