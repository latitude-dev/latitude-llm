import { DocumentTriggerType } from '..'
import {
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '../documentTriggers/schema'

type LatteDeleteScheduledTriggerAction = {
  triggerType: DocumentTriggerType.Scheduled
}

type LatteDeleteEmailTriggerAction = {
  triggerType: DocumentTriggerType.Email
}

type LatteDeleteIntegrationTriggerAction = {
  triggerType: DocumentTriggerType.Integration
  configuration: IntegrationTriggerConfiguration
}

type LatteUpdateScheduledTriggerAction = {
  triggerType: DocumentTriggerType.Scheduled
  configuration: ScheduledTriggerConfiguration
}

type LatteUpdateEmailTriggerAction = {
  triggerType: DocumentTriggerType.Email
  configuration: EmailTriggerConfiguration
}

type LatteUpdateIntegrationTriggerAction = {
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
