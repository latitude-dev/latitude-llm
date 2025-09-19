import { describe, it, expect, beforeEach, vi } from 'vitest'
import { database } from '../../client'
import { subscriptions } from '../../schema/models/subscriptions'
import { eq } from 'drizzle-orm'
import { SubscriptionPlan } from '../../plans'
import { autoScaleInactiveServers } from './autoScaleService'
import { createWorkspace, createMcpServer } from '../../tests/factories'
import { workspaces } from '../../schema'

const mocks = vi.hoisted(() => ({
  maintenanceQueue: vi.fn(),
}))

vi.mock('../../jobs/queues', () => ({
  queues: vi.fn().mockResolvedValue({
    maintenanceQueue: {
      add: mocks.maintenanceQueue,
    },
  }),
}))

describe('autoScaleInactiveServers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should enqueue scale down jobs for inactive servers on hobby plan workspaces', async () => {
    // Create a workspace with a hobby plan
    const { workspace } = await createWorkspace()
    await database
      .update(subscriptions)
      .set({ plan: SubscriptionPlan.HobbyV1 })
      .where(eq(subscriptions.workspaceId, workspace.id))

    // Create an inactive MCP server
    const server = await createMcpServer({
      workspace,
      lastUsedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      status: 'deployed',
      replicas: 1,
    })

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(1)

    // Verify job was enqueued with correct parameters
    expect(mocks.maintenanceQueue).toHaveBeenCalledWith(
      'scaleDownMcpServerJob',
      {
        mcpServerId: server.id,
      },
    )
  })

  it('should enqueue scale down jobs for inactive servers on hobby v2 plan workspaces', async () => {
    // Create a workspace with a hobby v2 plan
    const { workspace } = await createWorkspace()
    await database
      .update(subscriptions)
      .set({ plan: SubscriptionPlan.HobbyV2 })
      .where(eq(subscriptions.workspaceId, workspace.id))

    // Create an inactive MCP server
    const server = await createMcpServer({
      workspace,
      lastUsedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      status: 'deployed',
      replicas: 1,
    })

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(1)

    // Verify job was enqueued with correct parameters
    expect(mocks.maintenanceQueue).toHaveBeenCalledWith(
      'scaleDownMcpServerJob',
      {
        mcpServerId: server.id,
      },
    )
  })

  it('should not enqueue jobs for servers on non-hobby plans', async () => {
    // Create a workspace with a team plan
    const { workspace } = await createWorkspace()

    // Create a team subscription
    const currentSubscription = await database
      .insert(subscriptions)
      .values({ workspaceId: workspace.id, plan: SubscriptionPlan.TeamV1 })
      .returning()

    // Assing the subscription to the workspace
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: currentSubscription[0]!.id })
      .where(eq(workspaces.id, workspace.id))

    // Create an inactive MCP server
    await createMcpServer({
      workspace,
      lastUsedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      status: 'deployed',
      replicas: 1,
    })

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(0)

    // Verify no jobs were enqueued
    expect(mocks.maintenanceQueue).not.toHaveBeenCalled()
  })

  it('should not enqueue jobs for non-deployed servers', async () => {
    // Create a workspace with a hobby plan
    const { workspace } = await createWorkspace()
    await database
      .update(subscriptions)
      .set({ plan: SubscriptionPlan.HobbyV1 })
      .where(eq(subscriptions.workspaceId, workspace.id))

    // Create a non-deployed MCP server
    await createMcpServer({
      workspace,
      status: 'failed',
      lastUsedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      replicas: 1,
    })

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(0)

    // Verify no jobs were enqueued
    expect(mocks.maintenanceQueue).not.toHaveBeenCalled()
  })

  it('should not enqueue jobs for servers that are already at 0 replicas', async () => {
    // Create a workspace with a hobby plan
    const { workspace } = await createWorkspace()
    await database
      .update(subscriptions)
      .set({ plan: SubscriptionPlan.HobbyV1 })
      .where(eq(subscriptions.workspaceId, workspace.id))

    // Create an inactive MCP server with 0 replicas
    await createMcpServer({
      workspace,
      status: 'deployed',
      lastUsedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      replicas: 0,
    })

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(0)

    // Verify no jobs were enqueued
    expect(mocks.maintenanceQueue).not.toHaveBeenCalled()
  })

  it('should not enqueue jobs for servers that have been used recently', async () => {
    // Create a workspace with a hobby plan
    const { workspace } = await createWorkspace()
    await database
      .update(subscriptions)
      .set({ plan: SubscriptionPlan.HobbyV1 })
      .where(eq(subscriptions.workspaceId, workspace.id))

    // Create a recently used MCP server
    await createMcpServer({
      workspace,
      status: 'deployed',
      lastUsedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago (less than threshold)
      replicas: 1,
    })

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(0)

    // Verify no jobs were enqueued
    expect(mocks.maintenanceQueue).not.toHaveBeenCalled()
  })

  it('should handle job queue errors gracefully', async () => {
    // Create a workspace with a hobby plan
    const { workspace } = await createWorkspace()
    await database
      .update(subscriptions)
      .set({ plan: SubscriptionPlan.HobbyV1 })
      .where(eq(subscriptions.workspaceId, workspace.id))

    // Create an inactive MCP server
    await createMcpServer({
      workspace,
      lastUsedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      status: 'deployed',
      replicas: 1,
    })

    // Mock job queue to throw an error
    mocks.maintenanceQueue.mockRejectedValueOnce(
      new Error('Failed to enqueue job'),
    )

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('Failed to enqueue job')
  })

  it('should handle database errors gracefully', async () => {
    // Mock database query to throw an error
    vi.spyOn(database, 'select').mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    // Run the auto-scale function
    const result = await autoScaleInactiveServers()

    // Verify the result
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('Database error')

    // Verify no jobs were enqueued
    expect(mocks.maintenanceQueue).not.toHaveBeenCalled()
  })
})
