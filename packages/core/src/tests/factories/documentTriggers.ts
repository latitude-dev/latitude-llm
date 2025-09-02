import {
  DocumentTriggerParameters,
  DocumentTriggerType,
} from '@latitude-data/constants'
import { v4 as uuidv4 } from 'uuid'
import { database } from '../../client'
import { documentTriggers } from '../../schema'
import { createProject } from './createProject'
import { DocumentTrigger } from '../../browser'
import {
  EmailTriggerConfiguration,
  EmailTriggerDeploymentSettings,
  IntegrationTriggerConfiguration,
  IntegrationTriggerDeploymentSettings,
  ScheduledTriggerConfiguration,
  ScheduledTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'

/**
 * Creates a scheduled document trigger in the database
 */
export async function createScheduledDocumentTrigger({
  workspaceId,
  projectId,
  commitId,
  documentUuid = uuidv4(),
  cronExpression = '0 * * * *', // Default: run every hour
  lastRun,
  nextRunTime,
  enabled = true,
}: {
  workspaceId?: number
  projectId?: number
  commitId?: number
  documentUuid?: string
  cronExpression?: string
  lastRun?: Date
  nextRunTime?: Date
  enabled?: boolean
} = {}): Promise<DocumentTrigger> {
  // Create project if not provided
  if (!commitId || !projectId || !workspaceId) {
    const { project, commit } = await createProject({ skipMerge: true })
    workspaceId = project.workspaceId
    projectId = project.id
    commitId = commit.id
  }

  const configuration: ScheduledTriggerConfiguration = {
    cronExpression,
  }

  const deploymentSettings: ScheduledTriggerDeploymentSettings = {
    lastRun: lastRun || new Date(),
    nextRunTime,
  }

  const [trigger] = await database
    .insert(documentTriggers)
    .values({
      workspaceId,
      projectId,
      commitId,
      documentUuid,
      triggerType: DocumentTriggerType.Scheduled,
      triggerStatus: 'deployed',
      configuration,
      deploymentSettings,
      enabled,
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
  commitId,
  documentUuid = uuidv4(),
  name = 'Test Email Trigger',
  replyWithResponse = true,
  emailWhitelist = [],
  domainWhitelist = [],
  parameters = {},
  enabled = true,
}: {
  workspaceId?: number
  projectId?: number
  commitId?: number
  documentUuid?: string
  name?: string
  replyWithResponse?: boolean
  emailWhitelist?: string[]
  domainWhitelist?: string[]
  parameters?: Record<string, unknown>
  enabled?: boolean
} = {}) {
  // Create project if not provided
  if (!commitId || !projectId || !workspaceId) {
    const { project, commit } = await createProject({ skipMerge: true })
    workspaceId = project.workspaceId
    projectId = project.id
    commitId = commit.id
  }

  const configuration: EmailTriggerConfiguration = {
    name,
    replyWithResponse,
    emailWhitelist,
    domainWhitelist,
    parameters: parameters as Record<string, DocumentTriggerParameters>,
  }

  const deploymentSettings: EmailTriggerDeploymentSettings = {}

  const [trigger] = await database
    .insert(documentTriggers)
    .values({
      workspaceId,
      commitId,
      projectId,
      documentUuid,
      triggerType: DocumentTriggerType.Email,
      triggerStatus: 'deployed',
      configuration,
      deploymentSettings,
      enabled,
    })
    .returning()

  return trigger as DocumentTrigger<DocumentTriggerType.Email>
}

export async function createIntegrationDocumentTrigger({
  workspaceId,
  projectId,
  commitId,
  componentId = 'default',
  documentUuid = uuidv4(),
  integrationId,
  properties = {},
  payloadParameters = [],
}: {
  workspaceId?: number
  projectId?: number
  commitId?: number
  componentId?: string
  documentUuid?: string
  integrationId: number
  properties?: Record<string, unknown>
  payloadParameters?: string[]
}): Promise<DocumentTrigger> {
  // Create project if not provided
  if (!commitId || !projectId || !workspaceId) {
    const { project, commit } = await createProject({ skipMerge: true })
    workspaceId = project.workspaceId
    projectId = project.id
    commitId = commit.id
  }

  const configuration: IntegrationTriggerConfiguration = {
    integrationId,
    componentId,
    properties,
    payloadParameters,
  }

  const deploymentSettings: IntegrationTriggerDeploymentSettings = {
    triggerId: uuidv4(),
  }

  const [trigger] = await database
    .insert(documentTriggers)
    .values({
      workspaceId,
      projectId,
      commitId,
      documentUuid,
      triggerType: DocumentTriggerType.Integration,
      triggerStatus: 'deployed',
      configuration,
      deploymentSettings,
    })
    .returning()

  return trigger as DocumentTrigger
}
