// vitest-env.d.ts
import { beforeEach } from 'vitest'

import * as factories from './factories'
import useTestDatabase from './useTestDatabase'

// This do rollback stragegy for each test. Faster than truncate.
useTestDatabase()

beforeEach((ctx) => {
  ctx.factories = factories
})
