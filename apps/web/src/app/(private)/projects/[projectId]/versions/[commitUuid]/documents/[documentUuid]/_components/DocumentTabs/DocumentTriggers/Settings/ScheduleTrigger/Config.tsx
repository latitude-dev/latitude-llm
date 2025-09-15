import { useCallback, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { ScheduledTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { CronFormField } from '@latitude-data/web-ui/organisms/CronInput'
import { CLIENT_TIMEZONE } from '$/lib/constants'

const DEFAULT_CONFIG: ScheduledTriggerConfiguration = {
  cronExpression: '* * * * *',
  timezone: CLIENT_TIMEZONE,
}

export function ScheduleTriggerConfig({
  canDestroy = false,
  onChangeConfig,
  isLoading,
  initialConfig,
}: {
  canDestroy: boolean
  onChangeConfig: (config?: ScheduledTriggerConfiguration) => void
  isLoading: boolean
  initialConfig?: ScheduledTriggerConfiguration
}) {
  const [config, setConfig] = useState<ScheduledTriggerConfiguration>(
    initialConfig ?? DEFAULT_CONFIG,
  )

  const [isDirty, setIsDirty] = useState(false)
  const { commit } = useCurrentCommit()
  const disabled = !!commit.mergedAt || isLoading

  const handleChange = useCallback((newValue: string) => {
    setConfig(() => ({
      cronExpression: newValue,
      timezone: CLIENT_TIMEZONE,
    }))
    setIsDirty(true)
  }, [])

  const handleDestroy = useCallback(() => {
    onChangeConfig(undefined)
    setIsDirty(false)
  }, [onChangeConfig])

  const handleSave = useCallback(() => {
    onChangeConfig(config)
    setIsDirty(false)
  }, [onChangeConfig, config])

  return (
    <div className='flex flex-col gap-4'>
      <CronFormField
        name='cronExpression'
        value={config.cronExpression}
        onChange={handleChange}
        disabled={disabled || isLoading}
      />
      <div className='flex justify-end gap-2'>
        <Button
          fancy
          variant='destructive'
          onClick={handleDestroy}
          disabled={disabled || isLoading || !canDestroy}
        >
          Remove
        </Button>
        <Button
          fancy
          onClick={handleSave}
          disabled={disabled || isLoading || !isDirty}
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}
