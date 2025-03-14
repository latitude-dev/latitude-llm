import {
  DocumentTriggerParameters,
  DocumentTriggerType,
} from '@latitude-data/constants'
import { v4 as uuidv4 } from 'uuid'
import { database } from '../../client'
import { documentTriggers } from '../../schema'
import { createProject } from './createProject'
import {
  ScheduledTriggerConfiguration,
  EmailTriggerConfiguration,
} from '../../services/documentTriggers/helpers/schema'
import { DocumentTrigger } from '../../browser'

/**
 * Creates a scheduled document trigger in the database
 */
export async function createScheduledDocumentTrigger({
  workspaceId,
  projectId,
  documentUuid = uuidv4(),
  cronExpression = '0 * * * *', // Default: run every hour
  lastRun,
  nextRunTime,
  parameters = {},
}: {
  workspaceId?: number
  projectId?: number
  documentUuid?: string
  cronExpression?: string
  lastRun?: Date
  nextRunTime?: Date
  parameters?: Record<string, unknown>
} = {}): Promise<DocumentTrigger> {
  // Create project if not provided
  if (!projectId || !workspaceId) {
    const { project } = await createProject()
    workspaceId = project.workspaceId
    projectId = project.id
  }

  const configuration: ScheduledTriggerConfiguration = {
    cronExpression,
    lastRun: lastRun || new Date(),
    nextRunTime,
    parameters,
  }

  const [trigger] = await database
    .insert(documentTriggers)
    .values({
      workspaceId,
      projectId,
      documentUuid,
      triggerType: DocumentTriggerType.Scheduled,
      configuration,
    })
    .returning()

  return trigger as DocumentTrigger
}

/**
 * Creates an email document trigger in the database
 */
export async function createEmailDocumentTrigger({
  workspaceId,
  projectId,
  documentUuid = uuidv4(),
  name = 'Test Email Trigger',
  replyWithResponse = true,
  emailWhitelist = [],
  domainWhitelist = [],
  parameters = {},
}: {
  workspaceId?: number
  projectId?: number
  documentUuid?: string
  name?: string
  replyWithResponse?: boolean
  emailWhitelist?: string[]
  domainWhitelist?: string[]
  parameters?: Record<string, unknown>
} = {}) {
  // Create project if not provided
  if (!projectId || !workspaceId) {
    const { project } = await createProject()
    workspaceId = project.workspaceId
    projectId = project.id
  }

  const configuration: EmailTriggerConfiguration = {
    name,
    replyWithResponse,
    emailWhitelist,
    domainWhitelist,
    parameters: parameters as Record<string, DocumentTriggerParameters>,
  }

  const [trigger] = await database
    .insert(documentTriggers)
    .values({
      workspaceId,
      projectId,
      documentUuid,
      triggerType: DocumentTriggerType.Email,
      configuration,
    })
    .returning()

  return trigger
}
