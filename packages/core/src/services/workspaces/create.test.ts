import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { database } from '../../client'
import { subscriptions } from '../../schema/models/subscriptions'
import { createUser } from '../../tests/factories'
import { createWorkspace } from './create'

vi.mock('./path/to/subscription/service', () => ({
  createSubscription: vi.fn(),
}))

describe('createWorkspace', () => {
  it('should create a workspace for a valid user', async () => {
    const user = await createUser()
    const result = await createWorkspace({ name: 'foo', user })

    expect(result.ok).toBe(true)

    const workspace = result.value!
    const subscription = await database.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, workspace.id),
    })

    expect(subscription).toBeDefined()
  })
})
