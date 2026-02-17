import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import { rateLimitMiddleware } from './index'
import errorHandlerMiddleware from '../errorHandler'

// If the token is not even a UUID, we should fail fast and never touch the DB.
vi.mock('@latitude-data/core/queries/apiKeys/unsafelyGetApiKeyByToken', () => ({
  unsafelyGetApiKeyByToken: vi.fn(),
}))

describe('rateLimitMiddleware', () => {
  it('returns 401 for malformed authorization token and does not query the DB', async () => {
    const { unsafelyGetApiKeyByToken } = await import(
      '@latitude-data/core/queries/apiKeys/unsafelyGetApiKeyByToken'
    )

    const app = new Hono()
    app.use(rateLimitMiddleware())
    app.get('/', (c) => c.json({ ok: true }))
    app.onError(errorHandlerMiddleware)

    const res = await app.request('/', {
      headers: { Authorization: 'Bearer not-a-uuid' },
    })

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      name: 'UnauthorizedError',
      message: 'Invalid authorization token',
    })

    expect(unsafelyGetApiKeyByToken).not.toHaveBeenCalled()
  })
})
