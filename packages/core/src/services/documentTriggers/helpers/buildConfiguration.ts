import { DocumentTriggerType } from '@latitude-data/constants'
import { LatitudeError } from '../../../lib/errors'
import { getNextRunTime } from './cronHelper'
import {
  DocumentTriggerConfiguration,
  EmailTriggerConfiguration,
  InsertScheduledTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from './schema'

export function buildConfiguration({
  triggerType,
  configuration,
}: {
  triggerType: DocumentTriggerType
  configuration:
    | InsertScheduledTriggerConfiguration
    | EmailTriggerConfiguration
    | IntegrationTriggerConfiguration
}): DocumentTriggerConfiguration {
  switch (triggerType) {
    case 'integration':
      return configuration as IntegrationTriggerConfiguration
    case 'email':
      return configuration as EmailTriggerConfiguration
    case 'scheduled':
      return {
        ...configuration,
        lastRun: new Date(),
        nextRunTime: getNextRunTime(
          (configuration as InsertScheduledTriggerConfiguration).cronExpression,
        ),
      } as ScheduledTriggerConfiguration
    default:
      throw new LatitudeError('Invalid trigger type')
  }
}
