// vitest-env.d.ts

import { beforeEach, afterAll } from 'vitest'

import * as factories from './factories'
import useTestDatabase from './useTestDatabase'
import { removeTestFolder } from './testDrive'

// This do rollback stragegy for each test. Faster than truncate.
useTestDatabase()

beforeEach((ctx) => {
  ctx.factories = factories
})

afterAll(() => {
  removeTestFolder()
})
