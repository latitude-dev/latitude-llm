import { DocumentTriggerType } from '@latitude-data/constants'
import {
  EmailTriggerEventPayload,
  IntegrationTriggerEventPayload,
  ScheduledTriggerEventPayload,
} from '@latitude-data/constants/documentTriggers'
import { v4 as uuidv4 } from 'uuid'
import { DocumentTriggerEvent } from '../../browser'
import { database } from '../../client'
import { documentTriggerEvents } from '../../schema'
import { createProject } from './createProject'

/**
 * Base function to create a document trigger event with any payload
 */
async function createDocumentTriggerEventBase({
  workspaceId,
  commitId,
  triggerUuid = uuidv4(),
  triggerType,
  payload,
  documentLogUuid,
}: {
  workspaceId?: number
  commitId?: number
  triggerUuid?: string
  triggerType: DocumentTriggerType
  payload: Record<string, unknown>
  documentLogUuid?: string | null
}): Promise<DocumentTriggerEvent> {
  // Create project if not provided
  if (!commitId || !workspaceId) {
    const { project, commit } = await createProject()
    workspaceId = project.workspaceId
    commitId = commit.id
  }

  const [event] = await database
    .insert(documentTriggerEvents)
    .values({
      workspaceId,
      commitId,
      triggerUuid,
      triggerType,
      payload,
      documentLogUuid: documentLogUuid || null,
    })
    .returning()

  return event as DocumentTriggerEvent
}

/**
 * Creates a scheduled document trigger event in the database
 */
export async function createScheduledDocumentTriggerEvent({
  workspaceId,
  commitId,
  triggerUuid = uuidv4(),
  documentLogUuid,
  payload = {},
}: {
  workspaceId?: number
  commitId?: number
  triggerUuid?: string
  documentLogUuid?: string | null
  payload?: Partial<ScheduledTriggerEventPayload>
} = {}): Promise<DocumentTriggerEvent> {
  const defaultPayload: ScheduledTriggerEventPayload = {
    ...payload,
  }

  return createDocumentTriggerEventBase({
    workspaceId,
    commitId,
    triggerUuid,
    triggerType: DocumentTriggerType.Scheduled,
    payload: defaultPayload,
    documentLogUuid,
  })
}

/**
 * Creates an email document trigger event in the database
 */
export async function createEmailDocumentTriggerEvent({
  workspaceId,
  commitId,
  triggerUuid = uuidv4(),
  documentLogUuid,
  payload = {},
}: {
  workspaceId?: number
  commitId?: number
  triggerUuid?: string
  documentLogUuid?: string | null
  payload?: Partial<EmailTriggerEventPayload>
} = {}): Promise<DocumentTriggerEvent> {
  const defaultPayload: EmailTriggerEventPayload = {
    recipient: 'recipient@example.com',
    senderEmail: 'test@example.com',
    subject: 'Test Email',
    body: 'Test email body',
    attachments: [],
    ...payload,
  }

  return createDocumentTriggerEventBase({
    workspaceId,
    commitId,
    triggerUuid,
    triggerType: DocumentTriggerType.Email,
    payload: defaultPayload,
    documentLogUuid,
  })
}

/**
 * Creates an integration document trigger event in the database
 */
export async function createIntegrationDocumentTriggerEvent({
  workspaceId,
  commitId,
  triggerUuid = uuidv4(),
  documentLogUuid,
  payload = {},
}: {
  workspaceId?: number
  commitId?: number
  triggerUuid?: string
  documentLogUuid?: string | null
  payload?: Partial<IntegrationTriggerEventPayload>
} = {}): Promise<DocumentTriggerEvent> {
  const defaultPayload: IntegrationTriggerEventPayload = {
    key: 'value',
    timestamp: new Date().toISOString(),
    ...payload,
  }

  return createDocumentTriggerEventBase({
    workspaceId,
    commitId,
    triggerUuid,
    triggerType: DocumentTriggerType.Integration,
    payload: defaultPayload,
    documentLogUuid,
  })
}
