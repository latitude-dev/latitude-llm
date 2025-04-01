import { Input } from '@latitude-data/web-ui/atoms/Input'
import { ScheduleConfig } from './scheduleUtils'

interface CustomScheduleFormProps {
  config: ScheduleConfig
  updateConfig: (updater: (prev: ScheduleConfig) => ScheduleConfig) => void
  isLoading: boolean
}

export function CustomScheduleForm({
  config,
  updateConfig,
  isLoading,
}: CustomScheduleFormProps) {
  const handleCustomExpressionChange = (expression: string) => {
    updateConfig((prev) => ({
      ...prev,
      custom: {
        expression,
      },
    }))
  }

  return (
    <Input
      name='cron-expression'
      label='Cron Expression'
      description='Format: minute hour day month weekday (e.g., \"0 * * * *\" for every hour)'
      placeholder='* * * * *'
      value={config.custom?.expression || ''}
      onChange={(e) => handleCustomExpressionChange(e.target.value)}
      disabled={isLoading}
    />
  )
}
