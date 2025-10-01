import * as factories from '@latitude-data/core/factories'
import { PaymentRequiredError } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { inviteUserAction } from './invite'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    applyUserPlanLimit: vi.fn(),
    inviteUser: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

vi.mock(
  '@latitude-data/core/services/subscriptions/limits/applyUserPlanLimit',
  () => ({
    applyUserPlanLimit: mocks.applyUserPlanLimit,
  }),
)

vi.mock('@latitude-data/core/services/users/invite', () => ({
  inviteUser: mocks.inviteUser,
}))

describe('inviteUserAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)

      const [_, error] = await inviteUserAction({
        email: 'test@example.com',
        name: 'Test User',
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    let workspace: any
    let user: any

    beforeEach(async () => {
      const setup = await factories.createWorkspace()
      workspace = setup.workspace
      user = setup.userData

      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })

      // Reset mocks
      mocks.applyUserPlanLimit.mockReset()
      mocks.inviteUser.mockReset()
    })

    describe('plan limits enforcement', () => {
      it('successfully invites user when plan limits allow', async () => {
        const mockInvitedUser = {
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
        }

        mocks.applyUserPlanLimit.mockResolvedValue({ unwrap: () => {} })
        mocks.inviteUser.mockResolvedValue({ unwrap: () => mockInvitedUser })

        const [data, error] = await inviteUserAction({
          email: 'test@example.com',
          name: 'Test User',
        })

        expect(error).toBeNull()
        expect(data).toEqual(mockInvitedUser)
        expect(mocks.applyUserPlanLimit).toHaveBeenCalledWith({ workspace })
        expect(mocks.inviteUser).toHaveBeenCalledWith({
          email: 'test@example.com',
          name: 'Test User',
          workspace,
          author: user,
        })
      })

      it('rejects invitation when plan user limit is exceeded', async () => {
        const planLimitError = new PaymentRequiredError(
          'You have reached the maximum number of users allowed for this plan. Upgrade now.',
        )

        mocks.applyUserPlanLimit.mockResolvedValue({
          unwrap: () => {
            throw planLimitError
          },
        })

        const [data, error] = await inviteUserAction({
          email: 'test@example.com',
          name: 'Test User',
        })

        expect(data).toBeNull()
        expect(error).toBeDefined()
        expect(mocks.applyUserPlanLimit).toHaveBeenCalledWith({ workspace })
        expect(mocks.inviteUser).not.toHaveBeenCalled()
      })

      it('enforces plan limits before attempting user invitation', async () => {
        const planLimitError = new PaymentRequiredError('Plan limit exceeded')

        mocks.applyUserPlanLimit.mockResolvedValue({
          unwrap: () => {
            throw planLimitError
          },
        })
        mocks.inviteUser.mockResolvedValue({ unwrap: () => ({ id: 1 }) })

        const [data, error] = await inviteUserAction({
          email: 'test@example.com',
          name: 'Test User',
        })

        expect(data).toBeNull()
        expect(error).toBeDefined()

        // Verify order of operations: plan limit check happens first
        expect(mocks.applyUserPlanLimit).toHaveBeenCalled()
        expect(mocks.inviteUser).not.toHaveBeenCalled()
      })
    })

    describe('input validation', () => {
      beforeEach(() => {
        mocks.applyUserPlanLimit.mockResolvedValue({ unwrap: () => {} })
        mocks.inviteUser.mockResolvedValue({ unwrap: () => ({ id: 1 }) })
      })

      it('successfully invites user with valid input', async () => {
        const [data, error] = await inviteUserAction({
          email: 'valid@example.com',
          name: 'Valid User',
        })

        expect(error).toBeNull()
        expect(data).toBeDefined()
        expect(mocks.inviteUser).toHaveBeenCalledWith({
          email: 'valid@example.com',
          name: 'Valid User',
          workspace,
          author: user,
        })
      })

      it('passes through invitation service errors', async () => {
        const inviteError = new Error('User already exists')
        mocks.inviteUser.mockResolvedValue({
          unwrap: () => {
            throw inviteError
          },
        })

        const [data, error] = await inviteUserAction({
          email: 'test@example.com',
          name: 'Test User',
        })

        expect(data).toBeNull()
        expect(error).toBeDefined()
      })
    })

    describe('workspace context', () => {
      it('uses the correct workspace from session context', async () => {
        mocks.applyUserPlanLimit.mockResolvedValue({ unwrap: () => {} })
        mocks.inviteUser.mockResolvedValue({ unwrap: () => ({ id: 1 }) })

        await inviteUserAction({
          email: 'test@example.com',
          name: 'Test User',
        })

        expect(mocks.applyUserPlanLimit).toHaveBeenCalledWith({ workspace })
        expect(mocks.inviteUser).toHaveBeenCalledWith(
          expect.objectContaining({ workspace }),
        )
      })

      it('uses the correct author from session context', async () => {
        mocks.applyUserPlanLimit.mockResolvedValue({ unwrap: () => {} })
        mocks.inviteUser.mockResolvedValue({ unwrap: () => ({ id: 1 }) })

        await inviteUserAction({
          email: 'test@example.com',
          name: 'Test User',
        })

        expect(mocks.inviteUser).toHaveBeenCalledWith(
          expect.objectContaining({ author: user }),
        )
      })
    })
  })
})
