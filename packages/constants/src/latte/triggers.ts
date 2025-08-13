import { DocumentTriggerType } from '..'
import {
  EmailTriggerConfiguration,
  InsertIntegrationTriggerConfiguration,
  InsertScheduledTriggerConfiguration,
} from '../documentTriggers/schema'

type LatteCreateEmailTriggerAction = {
  operation: 'create'
  triggerType: DocumentTriggerType.Email
  configuration: EmailTriggerConfiguration
}

type LatteCreateScheduledTriggerAction = {
  operation: 'create'
  triggerType: DocumentTriggerType.Scheduled
  configuration: InsertScheduledTriggerConfiguration
}

type LatteCreateIntegrationTriggerAction = {
  operation: 'create'
  triggerType: DocumentTriggerType.Integration
  configuration: InsertIntegrationTriggerConfiguration
}

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
  configuration: InsertIntegrationTriggerConfiguration
}

type LatteUpdateScheduledTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Scheduled
  configuration: InsertScheduledTriggerConfiguration
}

type LatteUpdateEmailTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Email
  configuration: EmailTriggerConfiguration
}

type LatteUpdateIntegrationTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Integration
  configuration: InsertIntegrationTriggerConfiguration
}

export type LatteTriggerAction =
  | LatteCreateEmailTriggerAction
  | LatteCreateScheduledTriggerAction
  | LatteCreateIntegrationTriggerAction
  | LatteDeleteScheduledTriggerAction
  | LatteDeleteEmailTriggerAction
  | LatteDeleteIntegrationTriggerAction
  | LatteUpdateScheduledTriggerAction
  | LatteUpdateEmailTriggerAction
  | LatteUpdateIntegrationTriggerAction

export type LatteTriggerChanges = {
  projectId: number
  draftUuid: string
  promptUuid: string
  triggerType: DocumentTriggerType
}
