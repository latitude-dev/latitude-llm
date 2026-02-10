import { describe, expect, it, vi } from 'vitest'
import { processWebhookJob } from './processWebhookJob'
import * as factories from '../../../tests/factories'
import { type Commit } from '../../../schema/models/types/Commit'
import { Providers, SpanType } from '@latitude-data/constants'
import { CommitPublishedEvent, SpanCreatedEvent } from '../../../events/events'

describe('processWebhookJob', () => {
  const mocks = vi.hoisted(() => ({
    webhooksQueue: vi.fn(),
  }))

  vi.mock('../../queues', () => ({
    queues: vi.fn().mockResolvedValue({
      webhooksQueue: {
        add: mocks.webhooksQueue,
      },
    }),
  }))

  it('enqueues jobs for all active webhooks in the workspace', async () => {
    // Create a workspace and multiple webhooks
    const { workspace } = await factories.createWorkspace()
    const webhook1 = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example1.com/webhook',
      isActive: true,
      projectIds: [], // No filter
    })

    const webhook2 = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example2.com/webhook',
      isActive: true,
      projectIds: [123], // With filter
    })

    // Create an inactive webhook
    await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example3.com/webhook',
      isActive: false,
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
        changedDocuments: [{ path: 'test/doc', changeType: 'created' }],
      },
    }

    mocks.webhooksQueue.mockClear()

    // Process the webhook job
    await processWebhookJob({ data: event })

    // Verify jobs were enqueued for all active webhooks
    expect(mocks.webhooksQueue).toHaveBeenCalledTimes(2)
    expect(mocks.webhooksQueue).toHaveBeenCalledWith(
      'processIndividualWebhookJob',
      {
        event,
        webhookId: webhook1.id,
      },
    )
    expect(mocks.webhooksQueue).toHaveBeenCalledWith(
      'processIndividualWebhookJob',
      {
        event,
        webhookId: webhook2.id,
      },
    )
  })

  it('skips events without workspaceId', async () => {
    // Create a commit published event without workspaceId
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId: 0, // Invalid workspaceId
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

    mocks.webhooksQueue.mockClear()

    // Process the webhook job
    await processWebhookJob({ data: event })

    // Verify no jobs were enqueued
    expect(mocks.webhooksQueue).not.toHaveBeenCalled()
  })

  it('skips events that are not in WEBHOOK_EVENTS', async () => {
    // Create a workspace
    const { workspace } = await factories.createWorkspace()

    // Create a webhook
    await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [],
    })

    // Create an event that is not in WEBHOOK_EVENTS
    const event = {
      type: 'someOtherEvent',
      data: {
        workspaceId: workspace.id,
        someData: 'test',
      },
    }

    mocks.webhooksQueue.mockClear()

    // Process the webhook job
    await processWebhookJob({ data: event as any })

    // Verify no jobs were enqueued
    expect(mocks.webhooksQueue).not.toHaveBeenCalled()
  })

  it('enqueues jobs for spanCreated events when isConversationRoot is true', async () => {
    const { workspace, project } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        subagent: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            type: 'agent',
          },
        }),
      },
    })

    const webhook = await factories.createWebhook({
      workspaceId: workspace.id,
      url: 'https://example.com/webhook',
      isActive: true,
      projectIds: [], // No filter
    })

    const { apiKey } = await factories.createApiKey({ workspace })
    const span = await factories.createSpan({
      workspaceId: workspace.id,
      apiKeyId: apiKey.id,
      projectId: project.id,
      type: SpanType.Prompt,
      parentId: undefined, // Root span
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

    mocks.webhooksQueue.mockClear()

    // Process the webhook job
    await processWebhookJob({ data: event })

    // Verify a job was enqueued for the webhook
    expect(mocks.webhooksQueue).toHaveBeenCalledTimes(1)
    expect(mocks.webhooksQueue).toHaveBeenCalledWith(
      'processIndividualWebhookJob',
      {
        event,
        webhookId: webhook.id,
      },
    )
  })

  it('skips spanCreated events when isConversationRoot is false', async () => {
    const { workspace, project } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        subagent: factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })

    await factories.createWebhook({
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
      type: SpanType.Completion,
      parentId: 'some-parent-id', // Not a root span
    })

    const event: SpanCreatedEvent = {
      type: 'spanCreated',
      data: {
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        spanId: span.id,
        traceId: span.traceId,
        documentUuid: span.documentUuid ?? undefined,
        spanType: SpanType.Completion,
        isConversationRoot: false,
      },
    }

    mocks.webhooksQueue.mockClear()

    // Process the webhook job
    await processWebhookJob({ data: event })

    // Verify no jobs were enqueued because isConversationRoot is false
    expect(mocks.webhooksQueue).not.toHaveBeenCalled()
  })
})
