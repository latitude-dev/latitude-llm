import { DocumentTriggerType } from '..'
import {
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '../documentTriggers/schema'

type LatteDeleteScheduledTriggerAction = {
  operation: 'delete'
  triggerType: DocumentTriggerType.Scheduled
}

type LatteDeleteEmailTriggerAction = {
  operation: 'delete'
  triggerType: DocumentTriggerType.Email
}

type LatteDeleteIntegrationTriggerAction = {
  operation: 'delete'
  triggerType: DocumentTriggerType.Integration
  configuration: IntegrationTriggerConfiguration
}

type LatteUpdateScheduledTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Scheduled
  configuration: ScheduledTriggerConfiguration
}

type LatteUpdateEmailTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Email
  configuration: EmailTriggerConfiguration
}

type LatteUpdateIntegrationTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Integration
  configuration: IntegrationTriggerConfiguration
}

export type LatteTriggerAction =
  | LatteDeleteScheduledTriggerAction
  | LatteDeleteEmailTriggerAction
  | LatteDeleteIntegrationTriggerAction
  | LatteUpdateScheduledTriggerAction
  | LatteUpdateEmailTriggerAction
  | LatteUpdateIntegrationTriggerAction

export type LatteTriggerChanges = {
  projectId: number
  versionUuid: string
  promptUuid: string
  triggerType: DocumentTriggerType
}
