import { DocumentTriggerType } from '@latitude-data/constants'
import { LatitudeError } from '../../../lib/errors'
import { getNextRunTime } from './cronHelper'
import {
  DocumentTriggerConfiguration,
  EmailTriggerConfiguration,
  InsertDocumentTriggerWithConfiguration,
  InsertScheduledTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'

export function buildConfiguration({
  triggerType,
  configuration,
}: {
  triggerType: DocumentTriggerType
  configuration: InsertDocumentTriggerWithConfiguration['configuration']
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
