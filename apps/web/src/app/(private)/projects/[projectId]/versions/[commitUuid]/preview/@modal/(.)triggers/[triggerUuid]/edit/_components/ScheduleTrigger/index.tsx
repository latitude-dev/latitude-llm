import { useState, useCallback } from 'react'
import type { DocumentTriggerType } from '@latitude-data/constants'
import { ScheduleTriggerForm } from '../../../../_components/TriggerForms/ScheduleTriggerForm'
import {
  DEFAULT_CONFIG,
  type ScheduleConfig,
  convertToCronExpression,
} from '../../../../_components/TriggerForms/ScheduleTriggerForm/scheduleUtils'
import type { EditTriggerProps } from '../../EditTriggerModal'

export function EditScheduleTrigger({
  trigger,
  setConfiguration,
  isUpdating,
}: EditTriggerProps<DocumentTriggerType.Scheduled>) {
  const [config, setConfig] = useState<ScheduleConfig>({
    ...DEFAULT_CONFIG,
    type: 'custom',
    custom: {
      expression: trigger.configuration.cronExpression,
    },
  })

  const onUpdateConfiguration = useCallback(
    (updater: (prev: ScheduleConfig) => ScheduleConfig) => {
      const nextConfig = updater(config)
      setConfig(nextConfig)
      setConfiguration({
        cronExpression: convertToCronExpression(nextConfig),
      })
    },
    [setConfiguration, config],
  )

  return (
    <ScheduleTriggerForm
      config={config}
      setConfig={onUpdateConfiguration}
      isExecuting={isUpdating}
    />
  )
}
