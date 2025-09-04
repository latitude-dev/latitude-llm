import { DocumentTriggerType } from '..'
import {
  ChatTriggerConfiguration,
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

type LatteDeleteChatTriggerAction = {
  triggerType: DocumentTriggerType.Chat
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

type LatteUpdateChatTriggerAction = {
  triggerType: DocumentTriggerType.Chat
  configuration: ChatTriggerConfiguration
}

export type LatteTriggerAction =
  | LatteDeleteScheduledTriggerAction
  | LatteDeleteEmailTriggerAction
  | LatteDeleteIntegrationTriggerAction
  | LatteDeleteChatTriggerAction
  | LatteUpdateScheduledTriggerAction
  | LatteUpdateEmailTriggerAction
  | LatteUpdateIntegrationTriggerAction
  | LatteUpdateChatTriggerAction

export type LatteTriggerChanges = {
  projectId: number
  versionUuid: string
  promptUuid: string
  triggerType: DocumentTriggerType
}
