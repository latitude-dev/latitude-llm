import { OpenAPIHono } from '@hono/zod-openapi'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import errorHandlerMiddleware from './errorHandler'

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
}))

vi.mock('$/common/tracer', () => ({
  captureException: mocks.captureException,
}))

function createAppWithError(error: Error) {
  const app = new OpenAPIHono()

  app.get('/test', () => {
    throw error
  })
  app.onError(errorHandlerMiddleware)

  return app
}

describe('errorHandlerMiddleware', () => {
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'development'
  })

  afterAll(() => {
    process.env.NODE_ENV = previousNodeEnv
  })

  it('captures unknown chain errors even when response status is 422', async () => {
    const app = createAppWithError(
      new ChainError({
        code: RunErrorCodes.Unknown,
        message: 'value.toISOString is not a function',
      }),
    )

    const response = await app.request('/test')

    expect(response.status).toBe(422)
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })

  it('does not capture expected 422 chain errors', async () => {
    const app = createAppWithError(
      new ChainError({
        code: RunErrorCodes.DocumentConfigError,
        message: 'invalid configuration',
      }),
    )

    const response = await app.request('/test')

    expect(response.status).toBe(422)
    expect(mocks.captureException).not.toHaveBeenCalled()
  })
})
