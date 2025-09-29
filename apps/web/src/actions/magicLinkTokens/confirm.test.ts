import { ROUTES } from '$/services/routes'
import { User } from '@latitude-data/core/browser'
import { createProject } from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { confirmMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/confirm'
import { createMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/create'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmMagicLinkTokenAction } from './confirm'

vi.mock('$/lib/frontendRedirect', () => ({
  frontendRedirect: vi.fn(),
}))

vi.mock('$/services/auth/setSession', () => ({
  setSession: vi.fn(),
}))

describe('confirmMagicLinkTokenAction', () => {
  let user: User
  beforeEach(async () => {
    vi.clearAllMocks()

    const { user: u } = await createProject()

    user = u
  })

  it('should redirect to login if magic link token is expired', async () => {
    const token = await createMagicLinkToken({ user }).then((r) => r.unwrap())
    await confirmMagicLinkToken(token.token).then((r) => r.unwrap())

    await confirmMagicLinkTokenAction({
      token: token.token,
    })

    expect(frontendRedirect).toHaveBeenCalledWith(ROUTES.auth.login)
  })

  it('should redirect to login if magic link token does not exist', async () => {
    await confirmMagicLinkTokenAction({
      token: generateUUIDIdentifier(),
    })

    expect(frontendRedirect).toHaveBeenCalledWith(ROUTES.auth.login)
  })

  it('redirects to dashboard when magic link exists and is not expired', async () => {
    const token = await createMagicLinkToken({ user }).then((r) => r.unwrap())

    await confirmMagicLinkTokenAction({
      token: token.token,
    })

    expect(frontendRedirect).toHaveBeenCalledWith(ROUTES.dashboard.root)
  })

  it('redirects to returnTo when magic link exists and is not expired and has returnTo', async () => {
    const token = await createMagicLinkToken({
      user: user,
      returnTo: ROUTES.projects.root,
    }).then((r) => r.unwrap())

    await confirmMagicLinkTokenAction({
      token: token.token,
      returnTo: ROUTES.projects.root,
    })

    expect(frontendRedirect).toHaveBeenCalledWith(ROUTES.projects.root)
  })
})
