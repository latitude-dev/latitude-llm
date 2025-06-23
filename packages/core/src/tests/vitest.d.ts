import 'vitest'
import * as factories from './factories'
import { MockSpanExporter, MockSpanProcessor } from './telemetry'

declare module 'vitest' {
  export interface TestContext {
    mocks: {
      telemetry: {
        sdk: ReturnType<typeof vi.spyOn>
        exporter: MockSpanExporter
        processor: MockSpanProcessor
      }
    }
    factories: typeof factories
  }
}
