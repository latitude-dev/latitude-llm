import { Result, TypedResult } from '../../../lib/Result'
import {
  ScheduledTriggerConfiguration,
  ScheduledTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { getNextRunTime } from '../helpers/cronHelper'
import { DocumentTriggerStatus } from '@latitude-data/constants'

export function deployScheduledTrigger({
  configuration,
}: {
  configuration: ScheduledTriggerConfiguration
}): TypedResult<{
  deploymentSettings: ScheduledTriggerDeploymentSettings
  triggerStatus: DocumentTriggerStatus
}> {
  return Result.ok({
    deploymentSettings: {
      lastRun: new Date(),
      nextRunTime: getNextRunTime(configuration.cronExpression) ?? undefined,
    },
    triggerStatus: DocumentTriggerStatus.Deployed,
  })
}
