import {
  DocumentTriggerParameters,
  DocumentTriggerType,
  DocumentTriggerStatus,
} from '@latitude-data/constants'
import { v4 as uuidv4 } from 'uuid'
import { database } from '../../client'
import { documentTriggers } from '../../schema/models/documentTriggers'
import { createProject } from './createProject'
import {
  DocumentTrigger,
  Workspace,
  Project,
  Commit,
  DocumentVersion,
} from '../../schema/types'
import {
  EmailTriggerConfiguration,
  EmailTriggerDeploymentSettings,
  IntegrationTriggerConfiguration,
  IntegrationTriggerDeploymentSettings,
  ScheduledTriggerConfiguration,
  ScheduledTriggerDeploymentSettings,
  ChatTriggerConfiguration,
  ChatTriggerDeploymentSettings,
  DocumentTriggerConfiguration,
  DocumentTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { createTriggerHash } from '../../services/documentTriggers/helpers/triggerHash'

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
      triggerHash: createTriggerHash({ configuration }),
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
      triggerHash: createTriggerHash({ configuration }),
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
  triggerStatus = DocumentTriggerStatus.Deployed,
}: {
  workspaceId?: number
  projectId?: number
  commitId?: number
  componentId?: string
  documentUuid?: string
  integrationId: number
  properties?: Record<string, unknown>
  payloadParameters?: string[]
  triggerStatus?: DocumentTriggerStatus
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
      triggerStatus,
      configuration,
      deploymentSettings,
      triggerHash: createTriggerHash({ configuration }),
    })
    .returning()

  return trigger as DocumentTrigger
}

export async function createChatDocumentTrigger({
  workspaceId,
  projectId,
  commitId,
  documentUuid = uuidv4(),
  enabled = true,
}: {
  workspaceId?: number
  projectId?: number
  commitId?: number
  documentUuid?: string
  enabled?: boolean
} = {}): Promise<DocumentTrigger<DocumentTriggerType.Chat>> {
  if (!commitId || !projectId || !workspaceId) {
    const { project, commit } = await createProject({ skipMerge: true })
    workspaceId = project.workspaceId
    projectId = project.id
    commitId = commit.id
  }

  const configuration: ChatTriggerConfiguration = {}
  const deploymentSettings: ChatTriggerDeploymentSettings = {}

  const [trigger] = await database
    .insert(documentTriggers)
    .values({
      workspaceId,
      projectId,
      commitId,
      documentUuid,
      triggerType: DocumentTriggerType.Chat,
      triggerStatus: 'deployed',
      configuration,
      triggerHash: createTriggerHash({ configuration }),
      deploymentSettings,
      enabled,
    })
    .returning()

  return trigger as DocumentTrigger<DocumentTriggerType.Chat>
}

export async function createDocumentTrigger<T extends DocumentTriggerType>({
  workspace,
  project,
  commit,
  document,
  triggerType,
  configuration,
  triggerStatus = DocumentTriggerStatus.Deployed,
  deploymentSettings,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
  document: DocumentVersion
  triggerType: T
  configuration: DocumentTriggerConfiguration<T>
  triggerStatus?: DocumentTriggerStatus
  deploymentSettings?: DocumentTriggerDeploymentSettings<T>
}): Promise<DocumentTrigger<T>> {
  const [trigger] = await database
    .insert(documentTriggers)
    .values({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      triggerType,
      triggerStatus,
      configuration,
      triggerHash: createTriggerHash({ configuration }),
      deploymentSettings:
        deploymentSettings || ({} as DocumentTriggerDeploymentSettings<T>),
    })
    .returning()

  return trigger as DocumentTrigger<T>
}
