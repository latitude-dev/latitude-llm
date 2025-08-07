import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { database } from '../client'
import { memberships } from '../schema'
import { createUser, createWorkspace } from '../tests/factories'
import { findFirstUserInWorkspace } from './users'

describe('findFirstUserInWorkspace', () => {
  it('should find the first user in a workspace ordered by creation date', async () => {
    // Create first user and workspace
    const { workspace, userData: firstUser } = await createWorkspace()

    // Create and add second user to workspace
    const secondUser = await createUser()
    await createWorkspace({
      creator: secondUser,
    })

    // Find first user in workspace
    const foundUser = await findFirstUserInWorkspace(workspace)

    // First user should be returned since they were created first
    expect(foundUser).toBeDefined()
    expect(foundUser?.id).toBe(firstUser.id)
    expect(foundUser?.email).toBe(firstUser.email)
  })

  it('should return undefined when no users exist in workspace', async () => {
    // Create workspace with no additional users
    const { workspace } = await createWorkspace()

    // Delete the creator's membership (simulating empty workspace)
    await database.delete(memberships).where(eq(memberships.workspaceId, workspace.id))

    const foundUser = await findFirstUserInWorkspace(workspace)
    expect(foundUser).toBeUndefined()
  })

  it('should work with both WorkspaceDto and Workspace types', async () => {
    const { workspace, userData: user } = await createWorkspace()

    // Test with Workspace type
    const foundWithWorkspace = await findFirstUserInWorkspace(workspace)
    expect(foundWithWorkspace?.id).toBe(user.id)

    // Test with WorkspaceDto type
    const workspaceDto = {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      creatorId: workspace.creatorId,
    }
    // @ts-expect-error - mock
    const foundWithDto = await findFirstUserInWorkspace(workspaceDto)
    expect(foundWithDto?.id).toBe(user.id)
  })
})
