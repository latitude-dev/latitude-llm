import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Job } from 'bullmq'
import { processIndividualWebhookJob } from './processIndividualWebhookJob'
import * as factories from '../../../tests/factories'
import { type Commit } from '../../../schema/models/types/Commit'
import { CommitPublishedEvent, SpanCreatedEvent } from '../../../events/events'
import {
  createWebhookDelivery,
  sendSignedWebhook,
} from '../../../services/webhooks'
import { Result } from './../../../lib/Result'
import { Providers, SpanType } from '@latitude-data/constants'

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
        changedDocuments: [{ path: 'test/doc', changeType: 'created' }],
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
        changedDocuments: [{ path: 'test/doc', changeType: 'updated' }],
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
        changedDocuments: [{ path: 'test/doc', changeType: 'created' }],
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
        changedDocuments: [{ path: 'test/doc', changeType: 'deleted' }],
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

  it('processes spanCreated event type', async () => {
    const prompt = factories.helpers.createPrompt({
      provider: 'openai',
      model: 'gpt-4o',
    })
    const { workspace, project, commit, documents } =
      await factories.createProject({
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

    const { apiKey } = await factories.createApiKey({ workspace })
    const span = await factories.createSpan({
      workspaceId: workspace.id,
      apiKeyId: apiKey.id,
      projectId: project.id,
      type: SpanType.Prompt,
      parentId: undefined,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const event: SpanCreatedEvent = {
      type: 'spanCreated',
      data: {
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        spanId: span.id,
        traceId: span.traceId,
        documentUuid: span.documentUuid ?? undefined,
        spanType: SpanType.Prompt,
        isConversationRoot: true,
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

    // Verify webhook was sent with the correct payload
    // Note: eventType is 'documentLogCreated' for backward compatibility
    expect(sendSignedWebhook).toHaveBeenCalledWith({
      url: webhook.url,
      secret: webhook.secret,
      payload: {
        eventType: 'documentLogCreated',
        payload: expect.objectContaining({
          prompt: expect.any(Object),
          uuid: span.documentLogUuid,
          duration: span.duration,
          source: span.source,
          commitUuid: span.commitUuid,
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
        changedDocuments: [{ path: 'test/doc', changeType: 'updated' }],
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
        changedDocuments: [],
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
