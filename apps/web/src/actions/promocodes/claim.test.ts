import { createProject } from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Workspace, Promocode, User } from '@latitude-data/core/schema/types'
import { createCreditsPromocode } from '../../../../../packages/core/src/tests/factories/promocodes'
import { claimPromocodeAction } from './claim'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('claimPromocodeAction', () => {
  let workspace: Workspace
  let promocode: Promocode
  let user: User

  beforeEach(async () => {
    vi.clearAllMocks()

    const { workspace: w, user: u } = await createProject()
    user = u
    workspace = w

    promocode = await createCreditsPromocode(100)
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const { serverError } = await claimPromocodeAction({
        code: promocode.code,
      })

      expect(serverError).toEqual('Unauthorized')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    it('should successfully claim a promocode', async () => {
      const promocodeClaimed = await claimPromocodeAction({
        code: promocode.code,
      })

      expect(promocodeClaimed).toBeDefined()
      expect(promocodeClaimed.serverError).toBeUndefined()
      expect(promocodeClaimed.data).toBeDefined()
      expect(promocodeClaimed.data).toEqual(promocode)
    })
  })
})
