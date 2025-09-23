import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DocumentTriggerType,
  IntegrationType,
  Providers,
} from '@latitude-data/constants'
import { Commit, DocumentVersion, Project, Workspace } from '../../../browser'
import * as factories from '../../../tests/factories'
import { cloneDocumentTriggers } from './cloneTriggers'
import { IntegrationMapping } from './types'
import {
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'

describe('cloneDocumentTriggers', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let integrationMapping: IntegrationMapping

  beforeEach(async () => {
    const setup = await factories.createProject({
      skipMerge: true,
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Main document content',
        }),
      },
    })

    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]

    // Create integrations for mapping
    const integration1 = await factories.createIntegration({
      workspace,
      name: 'integration1',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://example1.com' },
    })

    const integration2 = await factories.createIntegration({
      workspace,
      name: 'integration2',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://example2.com' },
    })

    integrationMapping = {
      name: {
        integration1: integration1,
        integration2: integration2,
      },
      id: {
        [integration1.id]: integration1,
        [integration2.id]: integration2,
      },
    }
  })

  it('clones scheduled triggers correctly', async () => {
    const scheduledTrigger = await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      cronExpression: '0 9 * * 1',
      enabled: true,
    })

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [scheduledTrigger],
      integrationMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()

    expect(clonedTriggers).toHaveLength(1)
    const clonedTrigger = clonedTriggers[0]

    expect(clonedTrigger.triggerType).toBe(DocumentTriggerType.Scheduled)
    expect(clonedTrigger.documentUuid).toBe(document.documentUuid)
    expect(clonedTrigger.workspaceId).toBe(workspace.id)
    expect(clonedTrigger.projectId).toBe(project.id)
    expect(clonedTrigger.commitId).toBe(commit.id)

    // Configuration should be copied exactly for scheduled triggers
    const originalConfig =
      scheduledTrigger.configuration as ScheduledTriggerConfiguration
    const clonedConfig =
      clonedTrigger.configuration as ScheduledTriggerConfiguration
    expect(clonedConfig.cronExpression).toBe(originalConfig.cronExpression)
  })

  it('clones email triggers with privacy protection', async () => {
    const emailTrigger = await factories.createEmailDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      name: 'Test Email Trigger',
      replyWithResponse: true,
      emailWhitelist: ['user@example.com', 'admin@example.com'],
      domainWhitelist: ['example.com', 'test.com'],
      parameters: { param1: 'value1' },
      enabled: true,
    })

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [emailTrigger],
      integrationMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()

    expect(clonedTriggers).toHaveLength(1)
    const clonedTrigger = clonedTriggers[0]

    expect(clonedTrigger.triggerType).toBe(DocumentTriggerType.Email)
    expect(clonedTrigger.documentUuid).toBe(document.documentUuid)

    const originalConfig =
      emailTrigger.configuration as EmailTriggerConfiguration
    const clonedConfig =
      clonedTrigger.configuration as EmailTriggerConfiguration

    // These should be copied
    expect(clonedConfig.name).toBe(originalConfig.name)
    expect(clonedConfig.replyWithResponse).toBe(
      originalConfig.replyWithResponse,
    )
    expect(clonedConfig.parameters).toEqual(originalConfig.parameters)

    // These should be cleared for privacy
    expect(clonedConfig.emailWhitelist).toBeUndefined()
    expect(clonedConfig.domainWhitelist).toBeUndefined()
  })

  it('clones integration triggers with proper integration mapping', async () => {
    const integrationTrigger = await factories.createIntegrationDocumentTrigger(
      {
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        integrationId: integrationMapping.name.integration1.id,
        componentId: 'webhook-component',
        properties: {
          secret: 'sensitive-data',
          url: 'https://webhook.example.com',
        },
        payloadParameters: ['param1', 'param2'],
      },
    )

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [integrationTrigger],
      integrationMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()

    expect(clonedTriggers).toHaveLength(1)
    const clonedTrigger = clonedTriggers[0]

    expect(clonedTrigger.triggerType).toBe(DocumentTriggerType.Integration)
    expect(clonedTrigger.documentUuid).toBe(document.documentUuid)

    const originalConfig =
      integrationTrigger.configuration as IntegrationTriggerConfiguration
    const clonedConfig =
      clonedTrigger.configuration as IntegrationTriggerConfiguration

    // Integration should be mapped
    expect(clonedConfig.integrationId).toBe(
      integrationMapping.name.integration1.id,
    )

    // These should be copied
    expect(clonedConfig.componentId).toBe(originalConfig.componentId)
    expect(clonedConfig.payloadParameters).toEqual(
      originalConfig.payloadParameters,
    )

    // Properties should be cleared for privacy
    expect(clonedConfig.properties).toEqual({})
  })

  it('clones other trigger types correctly (fallback case)', async () => {
    // Test the fallback case for trigger types that copy configuration as-is
    // We'll use a scheduled trigger but test the configuration copying logic
    const scheduledTrigger = await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      cronExpression: '0 12 * * *',
      enabled: true,
    })

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [scheduledTrigger],
      integrationMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()

    expect(clonedTriggers).toHaveLength(1)
    const clonedTrigger = clonedTriggers[0]

    expect(clonedTrigger.triggerType).toBe(DocumentTriggerType.Scheduled)
    expect(clonedTrigger.documentUuid).toBe(document.documentUuid)
    expect(clonedTrigger.workspaceId).toBe(workspace.id)
    expect(clonedTrigger.projectId).toBe(project.id)
    expect(clonedTrigger.commitId).toBe(commit.id)

    // Configuration should be copied exactly for non-special trigger types
    const originalConfig =
      scheduledTrigger.configuration as ScheduledTriggerConfiguration
    const clonedConfig =
      clonedTrigger.configuration as ScheduledTriggerConfiguration
    expect(clonedConfig).toEqual(originalConfig)
  })

  it('clones multiple triggers of different types', async () => {
    const scheduledTrigger = await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      cronExpression: '0 */6 * * *',
    })

    const emailTrigger = await factories.createEmailDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      name: 'Multi Test Email',
      replyWithResponse: false,
    })

    const integrationTrigger = await factories.createIntegrationDocumentTrigger(
      {
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        integrationId: integrationMapping.name.integration2.id,
      },
    )

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [scheduledTrigger, emailTrigger, integrationTrigger],
      integrationMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()

    expect(clonedTriggers).toHaveLength(3)

    const clonedScheduled = clonedTriggers.find(
      (t) => t.triggerType === DocumentTriggerType.Scheduled,
    )
    const clonedEmail = clonedTriggers.find(
      (t) => t.triggerType === DocumentTriggerType.Email,
    )
    const clonedIntegration = clonedTriggers.find(
      (t) => t.triggerType === DocumentTriggerType.Integration,
    )

    expect(clonedScheduled).toBeDefined()
    expect(clonedEmail).toBeDefined()
    expect(clonedIntegration).toBeDefined()

    // All should point to the same document
    expect(clonedScheduled!.documentUuid).toBe(document.documentUuid)
    expect(clonedEmail!.documentUuid).toBe(document.documentUuid)
    expect(clonedIntegration!.documentUuid).toBe(document.documentUuid)
  })

  it('handles empty trigger list', async () => {
    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [],
      integrationMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()
    expect(clonedTriggers).toHaveLength(0)
  })

  it('handles integration trigger with missing integration mapping', async () => {
    // Create an integration that's not in the mapping
    const unmappedIntegration = await factories.createIntegration({
      workspace,
      name: 'unmapped-integration',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://unmapped.com' },
    })

    const integrationTrigger = await factories.createIntegrationDocumentTrigger(
      {
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        integrationId: unmappedIntegration.id,
      },
    )

    // Expect the function to throw an error when trying to access undefined integration
    await expect(
      cloneDocumentTriggers({
        workspace,
        project,
        commit,
        document,
        triggers: [integrationTrigger],
        integrationMapping,
      }),
    ).rejects.toThrow()
  })

  it('handles trigger creation failure', async () => {
    const scheduledTrigger = await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
    })

    // Mock the createDocumentTrigger to fail
    const mockError = new Error('Trigger creation failed')
    vi.spyOn(
      await import('../../documentTriggers/create'),
      'createDocumentTrigger',
    ).mockResolvedValue({
      ok: false,
      error: mockError,
    } as any)

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [scheduledTrigger],
      integrationMapping,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mockError)

    vi.restoreAllMocks()
  })

  it('preserves trigger configuration for non-special trigger types', async () => {
    // Test that scheduled triggers (non-special type) preserve configuration
    const scheduledTrigger = await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      cronExpression: '0 0 1 * *', // Monthly
      enabled: true,
    })

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [scheduledTrigger],
      integrationMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()

    expect(clonedTriggers).toHaveLength(1)
    const clonedTrigger = clonedTriggers[0]

    // Configuration should be copied exactly for scheduled triggers
    expect(clonedTrigger.configuration).toEqual(scheduledTrigger.configuration)
  })

  it('creates triggers with skipDeployment flag', async () => {
    const scheduledTrigger = await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
    })

    // Spy on createDocumentTrigger to verify skipDeployment is passed
    const createTriggerSpy = vi.spyOn(
      await import('../../documentTriggers/create'),
      'createDocumentTrigger',
    )

    await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [scheduledTrigger],
      integrationMapping,
    })

    // Verify that createDocumentTrigger was called with skipDeployment: true
    expect(createTriggerSpy).toHaveBeenCalledTimes(1)
    const callArgs = createTriggerSpy.mock.calls[0][0]
    expect(callArgs.skipDeployment).toBe(true)
    expect(callArgs.triggerType).toBe(scheduledTrigger.triggerType)

    vi.restoreAllMocks()
  })

  it('handles integration trigger with different integration mapping', async () => {
    // Create another workspace with different integrations
    const { workspace: otherWorkspace } = await factories.createWorkspace()

    const originalIntegration = await factories.createIntegration({
      workspace: otherWorkspace,
      name: 'original-integration',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://original.com' },
    })

    const mappedIntegration = integrationMapping.name.integration1

    // Update mapping to include the original integration
    const updatedMapping: IntegrationMapping = {
      ...integrationMapping,
      id: {
        ...integrationMapping.id,
        [originalIntegration.id]: mappedIntegration,
      },
    }

    const integrationTrigger = await factories.createIntegrationDocumentTrigger(
      {
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        integrationId: originalIntegration.id,
        componentId: 'test-component',
        payloadParameters: ['test-param'],
      },
    )

    const result = await cloneDocumentTriggers({
      workspace,
      project,
      commit,
      document,
      triggers: [integrationTrigger],
      integrationMapping: updatedMapping,
    })

    expect(result.ok).toBe(true)
    const clonedTriggers = result.unwrap()

    expect(clonedTriggers).toHaveLength(1)
    const clonedTrigger = clonedTriggers[0]

    const clonedConfig =
      clonedTrigger.configuration as IntegrationTriggerConfiguration

    // Should use the mapped integration ID
    expect(clonedConfig.integrationId).toBe(mappedIntegration.id)
    expect(clonedConfig.integrationId).not.toBe(originalIntegration.id)
  })
})
