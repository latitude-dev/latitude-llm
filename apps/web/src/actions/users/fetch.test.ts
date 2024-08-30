import { createWorkspace } from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getUsersActions } from './fetch'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('getUsersAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const [_, error] = await getUsersActions()

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      const { workspace, userData } = await createWorkspace({
        name: 'test',
      })
      mocks.getSession.mockReturnValue({
        user: userData,
        workspace: { id: workspace.id, name: workspace.name },
      })
    })

    it('returns all users', async () => {
      const [data, error] = await getUsersActions()

      expect(error).toBeNull()
      expect(data?.length).toEqual(1)
    })
  })
})
