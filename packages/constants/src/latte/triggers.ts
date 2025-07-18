import { DocumentTriggerType } from '..'
import {
  EmailTriggerConfiguration,
  InsertScheduledTriggerConfiguration,
} from '../documentTriggers/schema'

type LatteCreateEmailTriggerAction = {
  operation: 'create'
  triggerType: DocumentTriggerType.Email
  promptUuid: string
  configuration: EmailTriggerConfiguration
}

type LatteCreateScheduledTriggerAction = {
  operation: 'create'
  triggerType: DocumentTriggerType.Scheduled
  promptUuid: string
  configuration: InsertScheduledTriggerConfiguration
}

type LatteDeleteScheduledTriggerAction = {
  operation: 'delete'
  triggerType: DocumentTriggerType.Scheduled
  promptUuid: string
}

type LatteDeleteEmailTriggerAction = {
  operation: 'delete'
  triggerType: DocumentTriggerType.Email
  promptUuid: string
}

type LatteUpdateScheduledTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Scheduled
  promptUuid: string
  configuration: InsertScheduledTriggerConfiguration
}

type LatteUpdateEmailTriggerAction = {
  operation: 'update'
  triggerType: DocumentTriggerType.Email
  promptUuid: string
  configuration: EmailTriggerConfiguration
}

export type LatteTriggerAction =
  | LatteCreateEmailTriggerAction
  | LatteCreateScheduledTriggerAction
  | LatteDeleteScheduledTriggerAction
  | LatteDeleteEmailTriggerAction
  | LatteUpdateScheduledTriggerAction
  | LatteUpdateEmailTriggerAction

export type LatteTriggerChanges = {
  projectId: number
  draftUuid: string
  promptUuid: string
  triggerType: DocumentTriggerType
}
