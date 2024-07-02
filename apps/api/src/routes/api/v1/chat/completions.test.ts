import HttpStatusCodes from '@src/common/HttpStatusCodes'
import app from '@src/server'
import { Response } from 'express'
import supertest, { Test } from 'supertest'
import TestAgent from 'supertest/lib/agent'
import apiCb from 'test/support/apiCb'
import Paths from 'test/support/Paths'
import { beforeAll, describe, expect, it } from 'vitest'

// Tests
describe('CompletionsRouter', () => {
  let agent: TestAgent<Test>

  beforeAll(() => {
    agent = supertest.agent(app)
  })

  describe(`"GET:${Paths.Api.V1.Chat.Completions}"`, () => {
    const api = (cb: Function) =>
      agent.get(Paths.Api.V1.Chat.Completions).end(apiCb(cb))

    // Success
    it('should return 200', () =>
      new Promise<void>((done) => {
        api((res: Response) => {
          expect(res.status).toBe(HttpStatusCodes.OK)
          done()
        })
      }))
  })
})
