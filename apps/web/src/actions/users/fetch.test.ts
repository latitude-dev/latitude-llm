import { getSession } from '$/services/auth/getSession'
import { createWorkspace } from '$core/tests/factories/workspaces'
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest'

import { getUsersActions } from './fetch'

vi.mock('$/services/auth/getSession', () => ({
  getSession: vi.fn(),
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
      const session = await createWorkspace()
      ;(getSession as Mock).mockReturnValue({
        user: session.userData,
      })
    })

    it('returns all users', async () => {
      const [data, error] = await getUsersActions()

      expect(error).toBeNull()
      expect(data?.length).toEqual(1)
      // @ts-ignore - encryptedPassword is not defined on the User type for some reason?
      expect(data![0]!.encryptedPassword).toBeUndefined()
    })
  })
})
