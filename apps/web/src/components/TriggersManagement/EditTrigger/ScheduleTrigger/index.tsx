import { useCallback } from 'react'
import { DocumentTriggerType } from '@latitude-data/constants'
import { CronFormField } from '@latitude-data/web-ui/organisms/CronInput'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { CLIENT_TIMEZONE, DEFAULT_TIMEZONE } from '$/lib/constants'
import type { EditTriggerProps } from '../../types'

export function EditScheduleTrigger({
  trigger,
  setConfiguration,
  isUpdating,
}: EditTriggerProps<DocumentTriggerType.Scheduled>) {
  const triggerTimezone = trigger.configuration.timezone ?? DEFAULT_TIMEZONE

  const handleChange = useCallback(
    (newCronExpression: string) => {
      setConfiguration({
        ...trigger.configuration,
        cronExpression: newCronExpression,
      })
    },
    [setConfiguration, trigger.configuration],
  )

  return (
    <>
      <CronFormField
        name='cronExpression'
        value={trigger.configuration.cronExpression}
        onChange={handleChange}
        disabled={isUpdating}
      />
      {triggerTimezone !== CLIENT_TIMEZONE && (
        <Alert
          variant='warning'
          title='Timezone mismatch'
          description={`This trigger is configured in ${triggerTimezone} timezone. Create a new trigger to configure it in ${CLIENT_TIMEZONE} timezone.`}
        />
      )}
    </>
  )
}
