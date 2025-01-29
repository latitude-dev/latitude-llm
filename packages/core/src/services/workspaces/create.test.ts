import { describe, expect, it, vi } from 'vitest'

import { createUser } from '../../tests/factories'
import { createWorkspace } from './create'

vi.mock('./path/to/subscription/service', () => ({
  createSubscription: vi.fn(),
}))

describe('createWorkspace', () => {
  it('creates a hobby plan subscription', async () => {
    const user = await createUser()
    const workspace = await createWorkspace({ name: 'foo', user }).then((r) =>
      r.unwrap(),
    )
    expect(workspace.currentSubscription).toEqual(
      expect.objectContaining({ plan: 'hobby_v2' }),
    )
  })
})
