import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Job } from 'bullmq'
import { processIndividualWebhookJob } from './processIndividualWebhookJob'
import * as factories from '../../../tests/factories'
import { type Commit } from '../../../schema/models/types/Commit'
import { CommitPublishedEvent } from '../../../events/events'
import {
  createWebhookDelivery,
  sendSignedWebhook,
} from '../../../services/webhooks'
import { Result } from './../../../lib/Result'
import { Message, MessageRole } from '@latitude-data/constants/messages'
import { Providers } from '@latitude-data/constants'

// Mock the services
vi.mock('../../../services/webhooks', () => ({
  createWebhookDelivery: vi.fn(),
  sendSignedWebhook: vi.fn(),
}))

describe('processIndividualWebhookJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('processes webhook when projectId matches filter', async () => {
    // Create a workspace and webhook with specific project filter
    const { workspace } = await factories.createWorkspace()
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [123], // Filter for specific project
    })

    // Create a commit published event for matching project
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId: workspace.id,
        commit: {
          id: 1,
          uuid: 'test-uuid',
          title: 'Test Commit',
          projectId: 123,
          userId: 'user-1',
          mergedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Commit,
        userEmail: 'test@example.com',
      },
    }

    // Mock the sendSignedWebhook function to return a successful response
    vi.mocked(sendSignedWebhook).mockResolvedValue(
      Result.ok({
        success: true,
        statusCode: 200,
        responseBody: 'OK',
      }),
    )

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job
    await processIndividualWebhookJob(mockJob)

    // Verify webhook was sent
    expect(sendSignedWebhook).toHaveBeenCalledWith({
      url: webhook.url,
      secret: webhook.secret,
      payload: {
        eventType: event.type,
        payload: event.data,
      },
    })

    // Verify delivery record was created
    expect(createWebhookDelivery).toHaveBeenCalledWith({
      webhookId: webhook.id,
      eventType: event.type,
      status: 'success',
      responseStatus: 200,
      responseBody: 'OK',
      errorMessage: undefined,
    })
  })

  it('skips webhook when projectId does not match filter', async () => {
    // Create a workspace and webhook with specific project filter
    const { workspace } = await factories.createWorkspace()
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [456], // Filter for different project
    })

    // Create a commit published event for non-matching project
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId: workspace.id,
        commit: {
          id: 1,
          uuid: 'test-uuid',
          title: 'Test Commit',
          projectId: 123,
          userId: 'user-1',
          mergedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Commit,
        userEmail: 'test@example.com',
      },
    }

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job
    await processIndividualWebhookJob(mockJob)

    // Verify webhook was not sent
    expect(sendSignedWebhook).not.toHaveBeenCalled()
    expect(createWebhookDelivery).not.toHaveBeenCalled()
  })

  it('processes webhook when no projectIds filter is set', async () => {
    // Create a workspace and webhook
    const { workspace } = await factories.createWorkspace()
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [], // No project filter
    })

    // Create a commit published event
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId: workspace.id,
        commit: {
          id: 1,
          uuid: 'test-uuid',
          title: 'Test Commit',
          projectId: 123,
          userId: 'user-1',
          mergedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Commit,
        userEmail: 'test@example.com',
      },
    }

    // Mock the sendSignedWebhook function to return a successful response
    vi.mocked(sendSignedWebhook).mockResolvedValue(
      Result.ok({
        success: true,
        statusCode: 200,
        responseBody: 'OK',
      }),
    )

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job
    await processIndividualWebhookJob(mockJob)

    // Verify webhook was sent
    expect(sendSignedWebhook).toHaveBeenCalledWith({
      url: webhook.url,
      secret: webhook.secret,
      payload: {
        eventType: event.type,
        payload: event.data,
      },
    })

    // Verify delivery record was created
    expect(createWebhookDelivery).toHaveBeenCalledWith({
      webhookId: webhook.id,
      eventType: event.type,
      status: 'success',
      responseStatus: 200,
      responseBody: 'OK',
      errorMessage: undefined,
    })
  })

  it('handles webhook delivery failure', async () => {
    // Create a workspace and webhook
    const { workspace } = await factories.createWorkspace()
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [],
    })

    // Create a commit published event
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId: workspace.id,
        commit: {
          id: 1,
          uuid: 'test-uuid',
          title: 'Test Commit',
          projectId: 123,
          userId: 'user-1',
          mergedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Commit,
        userEmail: 'test@example.com',
      },
    }

    // Mock the sendSignedWebhook function to return a failed response
    vi.mocked(sendSignedWebhook).mockResolvedValue(
      Result.ok({
        success: false,
        statusCode: 500,
        responseBody: 'Internal Server Error',
        error: {
          message: 'Server error',
          name: 'Error',
        },
      }),
    )

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job
    await processIndividualWebhookJob(mockJob)

    // Verify webhook was sent
    expect(sendSignedWebhook).toHaveBeenCalledWith({
      url: webhook.url,
      secret: webhook.secret,
      payload: {
        eventType: event.type,
        payload: event.data,
      },
    })

    // Verify delivery record was created with failed status
    expect(createWebhookDelivery).toHaveBeenCalledWith({
      webhookId: webhook.id,
      eventType: event.type,
      status: 'failed',
      responseStatus: 500,
      responseBody: 'Internal Server Error',
      errorMessage: 'Server error',
    })
  })

  it('processes documentLogCreated event type', async () => {
    // Create a workspace and webhook
    // Create a project with a document
    const prompt = factories.helpers.createPrompt({
      provider: 'openai',
      model: 'gpt-4o',
    })
    const { workspace, commit, documents } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      name: 'Default Project',
      documents: {
        foo: prompt,
      },
    })

    const document = documents[0]!
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [],
    })

    // Create a document log with the factory
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      parameters: { test: 'value' },
      skipProviderLogs: true,
    })

    // Create a provider log for the document log
    const provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'wat',
      user: await factories.createUser(),
    })

    const messages = [
      { role: MessageRole.user, content: 'Hello, how are you?' },
      {
        role: MessageRole.assistant,
        content: 'I am doing well, thank you for asking!',
      },
    ]

    await factories.createProviderLog({
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: Providers.OpenAI,
      workspace,
      messages: messages as Message[],
      responseText: 'I am doing well, thank you for asking!',
      model: 'gpt-4',
      duration: 1000,
      tokens: 50,
    })

    // Create a documentLogCreated event
    const event = {
      type: 'documentLogCreated',
      data: {
        id: documentLog.id,
        workspaceId: workspace.id,
      },
    }

    // Mock the sendSignedWebhook function to return a successful response
    vi.mocked(sendSignedWebhook).mockResolvedValue(
      Result.ok({
        success: true,
        statusCode: 200,
        responseBody: 'OK',
      }),
    )

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job
    await processIndividualWebhookJob(mockJob)

    // Verify webhook was sent with the correct payload including messages
    expect(sendSignedWebhook).toHaveBeenCalledWith({
      url: webhook.url,
      secret: webhook.secret,
      payload: {
        eventType: event.type,
        payload: expect.objectContaining({
          prompt: expect.any(Object),
          uuid: documentLog.uuid,
          parameters: { test: 'value' },
          customIdentifier: null,
          duration: expect.any(Number),
          source: expect.any(String),
          commitId: commit.id,
          messages: messages,
          response: expect.any(String),
        }),
      },
    })

    // Verify delivery record was created
    expect(createWebhookDelivery).toHaveBeenCalledWith({
      webhookId: webhook.id,
      eventType: event.type,
      status: 'success',
      responseStatus: 200,
      responseBody: 'OK',
      errorMessage: undefined,
    })
  })

  it('handles webhook sending error', async () => {
    // Create a workspace and webhook
    const { workspace } = await factories.createWorkspace()
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [],
    })

    // Create a commit published event
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId: workspace.id,
        commit: {
          id: 1,
          uuid: 'test-uuid',
          title: 'Test Commit',
          projectId: 123,
          userId: 'user-1',
          mergedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Commit,
        userEmail: 'test@example.com',
      },
    }

    // Mock the sendSignedWebhook function to return an error
    vi.mocked(sendSignedWebhook).mockResolvedValue(
      Result.error(new Error('Network error')),
    )

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job
    await processIndividualWebhookJob(mockJob)

    // Verify webhook was sent
    expect(sendSignedWebhook).toHaveBeenCalledWith({
      url: webhook.url,
      secret: webhook.secret,
      payload: {
        eventType: event.type,
        payload: event.data,
      },
    })

    // Verify delivery record was created with failed status
    expect(createWebhookDelivery).toHaveBeenCalledWith({
      webhookId: webhook.id,
      eventType: event.type,
      status: 'failed',
      errorMessage: 'Network error',
    })
  })

  it('throws error when webhook is not found or inactive', async () => {
    // Create a workspace and webhook
    const { workspace } = await factories.createWorkspace()
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: false, // Inactive webhook
      projectIds: [],
    })

    // Create a commit published event
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId: workspace.id,
        commit: {
          id: 1,
          uuid: 'test-uuid',
          title: 'Test Commit',
          projectId: 123,
          userId: 'user-1',
          mergedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Commit,
        userEmail: 'test@example.com',
      },
    }

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job and expect it to throw an error
    await expect(processIndividualWebhookJob(mockJob)).rejects.toThrow(
      `Webhook not found or inactive: ${webhook.id}`,
    )

    // Verify webhook was not sent
    expect(sendSignedWebhook).not.toHaveBeenCalled()
    expect(createWebhookDelivery).not.toHaveBeenCalled()
  })

  it('throws error when projectId cannot be extracted from event', async () => {
    // Create a workspace and webhook
    const { workspace } = await factories.createWorkspace()
    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [],
    })

    // Create an event without a projectId
    const event = {
      type: 'commitPublished',
      data: {
        workspaceId: workspace.id,
        commit: {
          id: 1,
          uuid: 'test-uuid',
          title: 'Test Commit',
          // Missing projectId
          userId: 'user-1',
          mergedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Commit,
        userEmail: 'test@example.com',
      },
    }

    // Create a mock job
    const mockJob = {
      data: {
        event,
        webhookId: webhook.id,
      },
    } as Job

    // Process the webhook job and expect it to throw an error
    await expect(processIndividualWebhookJob(mockJob)).rejects.toThrow(
      'No project id found in event commitPublished',
    )

    // Verify webhook was not sent
    expect(sendSignedWebhook).not.toHaveBeenCalled()
    expect(createWebhookDelivery).not.toHaveBeenCalled()
  })
})
