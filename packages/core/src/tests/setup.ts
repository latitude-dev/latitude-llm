// vitest-env.d.ts

import {
  DEFAULT_REDACT_SPAN_PROCESSOR,
  LatitudeTelemetry,
} from '@latitude-data/telemetry'
import { afterAll, beforeEach, vi } from 'vitest'
import * as telemetry from '../telemetry'
import * as factories from './factories'
import { MockSpanExporter, MockSpanProcessor } from './telemetry'
import { removeTestFolder } from './testDrive'
import setupTestDatabase from './useTestDatabase'

// This do rollback strategy for each test. Faster than truncate.
setupTestDatabase()

// Create a single telemetry instance for all tests to avoid MaxListeners warning
const exporter = new MockSpanExporter()
const processor = new MockSpanProcessor()
const telemetryInstance = new LatitudeTelemetry('internal', {
  instrumentations: {},
  disableBatch: true,
  exporter: exporter,
  processors: [processor, DEFAULT_REDACT_SPAN_PROCESSOR()],
})

beforeEach((ctx) => {
  const sdk = vi
    .spyOn(telemetry, 'telemetry', 'get')
    .mockReturnValue(telemetryInstance)

  ctx.mocks = { telemetry: { sdk, exporter, processor } }
  ctx.factories = factories
})

afterAll(async () => {
  // Clean up the shared telemetry instance
  await telemetryInstance.shutdown()
  removeTestFolder()
})
