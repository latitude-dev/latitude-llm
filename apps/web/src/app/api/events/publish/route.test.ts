import { publisher } from '@latitude-data/core/events/publisher'
import { env } from '@latitude-data/env'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

vi.mock('@latitude-data/env', () => ({
  env: {
    EVENT_PUBLISHER_API_KEY: 'test-api-key',
    WORKERS: false,
  },
}))

vi.mock('@latitude-data/core/events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

vi.mock('$/middlewares/errorHandler', () => ({
  errorHandler: (fn: Function) => fn,
}))

describe('Event Publish API', () => {
  let mockReq: NextRequest
    // @ts-expect-error - testing
  let mockJson: vi.Mock

  beforeEach(() => {
    vi.resetAllMocks()

    vi.mocked(env).WORKERS = false
    mockJson = vi.fn()
    mockReq = new NextRequest('http://localhost/api/events/publish', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
    })
    mockReq.json = mockJson.mockResolvedValue({
      type: 'TEST_EVENT',
      payload: {},
    })
  })

  it('should return 405 for non-POST requests', async () => {
    mockReq = new NextRequest('http://localhost/api/events/publish', {
      method: 'GET',
    })
    // @ts-expect-error - testing
    const response = await POST(mockReq)
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ error: 'Method Not Allowed' })
  })

  it('should return 401 for missing Authorization header', async () => {
    mockReq.headers.delete('Authorization')
    // @ts-expect-error - testing
    const response = await POST(mockReq)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('should return 401 for invalid API key', async () => {
    mockReq.headers.set('Authorization', 'Bearer invalid-key')
    // @ts-expect-error - testing
    const response = await POST(mockReq)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('should return 400 if WORKERS is true', async () => {
    vi.mocked(env).WORKERS = true
    // @ts-expect-error - testing
    const response = await POST(mockReq)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Workers do not support Redis',
    })
  })

  it('should publish event successfully', async () => {
    // @ts-expect-error - testing
    const response = await POST(mockReq)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: 'Event published successfully',
    })
    expect(publisher.publishLater).toHaveBeenCalledWith({
      type: 'TEST_EVENT',
      payload: {},
    })
  })

  it('should return 400 for invalid event data', async () => {
    mockReq.json = mockJson.mockResolvedValue(null)
    // @ts-expect-error - testing
    const response = await POST(mockReq)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid event data' })
  })

  it('should return 500 for internal server error', async () => {
    vi.mocked(publisher.publishLater).mockRejectedValue(new Error('Test error'))
    // @ts-expect-error - testing
    const response = await POST(mockReq)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal Server Error' })
  })
})
