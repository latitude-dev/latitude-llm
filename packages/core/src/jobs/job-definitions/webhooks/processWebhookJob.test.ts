import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webhooksQueue } from '../../queues'
import { processWebhookJob } from './processWebhookJob'
import * as factories from '../../../tests/factories'
import { Commit } from '../../../browser'
import { CommitPublishedEvent } from '../../../events/events'

describe('processWebhookJob', () => {
  const mocks = vi.hoisted(() => ({
    webhooksQueue: vi.fn(),
  }))

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    // Mock the webhooksQueue.add method
    vi.spyOn(webhooksQueue, 'add').mockImplementation(mocks.webhooksQueue)
  })

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
      },
    }

    // Process the webhook job
    await processWebhookJob({ data: event })

    // Verify jobs were enqueued for all active webhooks
    expect(mocks.webhooksQueue).toHaveBeenCalledTimes(2)
    expect(mocks.webhooksQueue).toHaveBeenCalledWith(
      'processIndividualWebhookJob',
      {
        projectId: 123,
        event,
        webhookId: webhook1.id,
      },
    )
    expect(mocks.webhooksQueue).toHaveBeenCalledWith(
      'processIndividualWebhookJob',
      {
        projectId: 123,
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
      },
    }

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

    // Process the webhook job
    await processWebhookJob({ data: event as any })

    // Verify no jobs were enqueued
    expect(mocks.webhooksQueue).not.toHaveBeenCalled()
  })

  it('throws error when projectId cannot be extracted from event', async () => {
    // Create a workspace
    const { workspace } = await factories.createWorkspace()

    // Create a webhook
    await factories.createWebhook({
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

    // Process the webhook job and expect it to throw an error
    await expect(processWebhookJob({ data: event as any })).rejects.toThrow(
      'No project id found in event commitPublished',
    )

    // Verify no jobs were enqueued
    expect(mocks.webhooksQueue).not.toHaveBeenCalled()
  })
})
