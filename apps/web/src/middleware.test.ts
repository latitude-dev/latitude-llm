import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { middleware } from './middleware'

describe('handler', () => {
  const req = new NextRequest(new Request('http://acme.com'))

  it('succeeds', async () => {
    req.headers.set('Authorization', `Bearer ${process.env.API_KEY}`)
    const res = middleware(req)

    expect(res.status).toBe(200)
  })

  describe('with invalid api key', () => {
    it('fails', () => {
      req.headers.set('Authorization', `Bearer thisaintgonnaflyman`)
      const res = middleware(req)

      expect(res.status).toBe(401)
    })
  })
})
