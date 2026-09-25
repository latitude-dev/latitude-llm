import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTES } from '$/services/routes'
import { loginAction } from './loginAction'

const mocks = vi.hoisted(() => {
  return {
    createMagicLinkToken: vi.fn(),
  }
})

vi.mock('@latitude-data/core/services/magicLinkTokens/create', () => ({
  createMagicLinkToken: mocks.createMagicLinkToken,
}))

describe('loginAction', () => {
  beforeEach(() => {
    mocks.createMagicLinkToken.mockReset()
    mocks.createMagicLinkToken.mockResolvedValue({ unwrap: () => ({}) })
  })

  it('sends a magic link to an existing user', async () => {
    const { user } = await factories.createProject()

    const { data, serverError } = await loginAction({ email: user.email })

    expect(serverError).toBeUndefined()
    expect(mocks.createMagicLinkToken).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: user.id }),
      returnTo: undefined,
    })
    expect(data.frontendRedirect).toEqual(ROUTES.auth.magicLinkSent(user.email))
  })

  it('does not reveal whether an account exists', async () => {
    const { user } = await factories.createProject()

    await loginAction({ email: user.email })
    const unknown = await loginAction({ email: 'nobody@example.com' })

    expect(unknown.serverError).toBeUndefined()
    expect(mocks.createMagicLinkToken).toHaveBeenCalledTimes(1)
    expect(unknown.data.frontendRedirect).toEqual(
      ROUTES.auth.magicLinkSent('nobody@example.com'),
    )
  })
})
