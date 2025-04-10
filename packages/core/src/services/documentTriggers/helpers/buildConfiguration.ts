import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTriggerConfiguration,
  EmailTriggerConfiguration,
  InsertScheduledTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from './schema'
import { getNextRunTime } from './cronHelper'
import { LatitudeError } from './../../../lib/errors'

export function buildConfiguration({
  triggerType,
  configuration,
}: {
  triggerType: DocumentTriggerType
  configuration: InsertScheduledTriggerConfiguration | EmailTriggerConfiguration
}): DocumentTriggerConfiguration {
  switch (triggerType) {
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
