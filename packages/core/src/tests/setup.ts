// vitest-env.d.ts

import { beforeEach, afterAll } from 'vitest'

import * as factories from './factories'
import setupTestDatabase from './useTestDatabase'
import { removeTestFolder } from './testDrive'

// This do rollback stragegy for each test. Faster than truncate.
setupTestDatabase()

beforeEach((ctx) => {
  ctx.factories = factories
})

afterAll(() => {
  removeTestFolder()
})
