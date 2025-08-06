import { DocumentTriggerType } from '@latitude-data/constants'
import { LatitudeError } from '../../../lib/errors'
import { getNextRunTime } from './cronHelper'
import {
  DocumentTriggerConfiguration,
  EmailTriggerConfiguration,
  InsertDocumentTriggerWithConfiguration,
  ScheduledTriggerConfiguration,
  IntegrationTriggerConfigurationWithDeployementSettings,
  ScheduledTriggerConfigurationWithDeployementSettings,
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
      return configuration as IntegrationTriggerConfigurationWithDeployementSettings
    case 'email':
      return configuration as EmailTriggerConfiguration
    case 'scheduled':
      return {
        ...configuration,
        lastRun: new Date(),
        nextRunTime: getNextRunTime(
          (configuration as ScheduledTriggerConfiguration).cronExpression,
        ),
      } as ScheduledTriggerConfigurationWithDeployementSettings
    default:
      throw new LatitudeError('Invalid trigger type')
  }
}
