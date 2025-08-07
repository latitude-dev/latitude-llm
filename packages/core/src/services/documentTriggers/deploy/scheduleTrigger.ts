import { Result, type TypedResult } from '../../../lib/Result'
import type {
  ScheduledTriggerConfiguration,
  ScheduledTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { getNextRunTime } from '../helpers/cronHelper'

export function deployScheduledTrigger({
  configuration,
}: {
  configuration: ScheduledTriggerConfiguration
}): TypedResult<ScheduledTriggerDeploymentSettings> {
  return Result.ok({
    lastRun: new Date(),
    nextRunTime: getNextRunTime(configuration.cronExpression) ?? undefined,
  })
}
