import 'vitest'

import * as factories from './factories'

declare module 'vitest' {
  export interface TestContext {
    factories: typeof factories
  }
}
