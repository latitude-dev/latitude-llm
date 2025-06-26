import { Context } from '@opentelemetry/api'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import {
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-node'
import { vi } from 'vitest'

// prettier-ignore
export class MockSpanProcessor implements SpanProcessor {
  onStart = vi.fn((_span: ReadableSpan, _context: Context): void => {
    // Noop
  })

  onEnd = vi.fn((_span: ReadableSpan): void => {
    // Noop
  })

  forceFlush = vi.fn((): Promise<void> => {
    return Promise.resolve()
  })

  shutdown = vi.fn((): Promise<void> => {
    return Promise.resolve()
  })

  mockClear() {
    this.onStart.mockClear()
    this.onEnd.mockClear()
    this.forceFlush.mockClear()
    this.shutdown.mockClear()
  }

  mockReset() {
    this.onStart.mockReset()
    this.onEnd.mockReset()
    this.forceFlush.mockReset()
    this.shutdown.mockReset()
  }

  mockRestore() {
    this.onStart.mockRestore()
    this.onEnd.mockRestore()
    this.forceFlush.mockRestore()
    this.shutdown.mockRestore()
  }
}

// prettier-ignore
export class MockSpanExporter implements SpanExporter {
  export = vi.fn((_spans: ReadableSpan[], callback: (result: ExportResult) => void): void => {
    callback({ code: ExportResultCode.SUCCESS })
  })

  shutdown = vi.fn((): Promise<void> => {
    return Promise.resolve()
  })

  forceFlush = vi.fn((): Promise<void> => {
    return Promise.resolve()
  })

  mockClear() {
    this.export.mockClear()
    this.shutdown.mockClear()
    this.forceFlush.mockClear()
  }

  mockReset() {
    this.export.mockReset()
    this.shutdown.mockReset()
    this.forceFlush.mockReset()
  }

  mockRestore() {
    this.export.mockRestore()
    this.shutdown.mockRestore()
    this.forceFlush.mockRestore()
  }
}
