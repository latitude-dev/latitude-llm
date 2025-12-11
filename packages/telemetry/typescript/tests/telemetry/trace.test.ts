import { LatitudeTelemetry } from '$telemetry/index'
import { ATTR_LATITUDE_PROMPT_PATH, HEAD_COMMIT } from '@latitude-data/constants'
import { context } from '@opentelemetry/api'
import { ReadableSpan } from '@opentelemetry/sdk-trace-node'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { mockRequest, MockSpanProcessor } from '../utils'

vi.hoisted(() => {
  process.env.GATEWAY_BASE_URL = 'https://fake-host.com'
  process.env.npm_package_name = 'fake-service-name'
  process.env.npm_package_version = 'fake-scope-version'
})

describe('telemetry.trace', () => {
  const gatewayMock = setupServer()

  beforeAll(() => {
    gatewayMock.listen()
  })

  afterEach(() => {
    gatewayMock.resetHandlers()
    vi.clearAllMocks()
  })

  afterAll(() => {
    gatewayMock.close()
  })

  it(
    'creates parent span with correct latitude attributes',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        disableBatch: true,
      })

      await sdk.trace(
        {
          name: 'test-trace',
          projectId: 123,
          versionUuid: 'version-uuid-123',
          promptPath: 'chat/greeting',
          externalId: 'external-123',
        },
        async () => {
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 10))
          return 'result'
        },
      )

      await sdk.shutdown()

      expect(bodyMock).toHaveBeenCalled()
      const body = bodyMock.mock.calls[0]![0]

      // Find the prompt span (parent)
      const spans = body.resourceSpans[0].scopeSpans[0].spans
      expect(spans).toHaveLength(1)

      const promptSpan = spans[0]
      expect(promptSpan.name).toBe('test-trace')

      // Verify latitude attributes
      const attributes = promptSpan.attributes
      expect(attributes).toContainEqual({
        key: 'latitude.type',
        value: { stringValue: 'prompt' },
      })
      expect(attributes).toContainEqual({
        key: 'latitude.projectId',
        value: { stringValue: '123' },
      })
      expect(attributes).toContainEqual({
        key: 'latitude.commitUuid',
        value: { stringValue: 'version-uuid-123' },
      })
      expect(attributes).toContainEqual({
        key: ATTR_LATITUDE_PROMPT_PATH,
        value: { stringValue: 'chat/greeting' },
      })
      expect(attributes).toContainEqual({
        key: 'latitude.externalId',
        value: { stringValue: 'external-123' },
      })
    }),
  )

  it(
    'child spans inherit parent and baggage attributes',
    gatewayMock.boundary(async () => {
      const processorMock = new MockSpanProcessor()

      const sdk = new LatitudeTelemetry('fake-api-key', {
        disableBatch: true,
        processors: [processorMock],
      })

      mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      await sdk.trace(
        {
          name: 'parent-trace',
          projectId: 456,
          versionUuid: 'parent-version',
          promptPath: 'test/path',
        },
        async () => {
          // Create a child completion span inside the trace
          const completion = sdk.completion(context.active(), {
            provider: 'openai',
            model: 'gpt-4o',
            configuration: { model: 'gpt-4o' },
            input: [{ role: 'user', content: 'Hello' }],
          })
          completion.end({
            output: [{ role: 'assistant', content: 'Hi' }],
            tokens: { prompt: 5, cached: 0, reasoning: 0, completion: 2 },
            finishReason: 'stop',
          })
          return 'done'
        },
      )

      await sdk.shutdown()

      // Get all spans that were created
      const endedSpans = processorMock.onEnd.mock.calls.map(
        (call) => call[0] as ReadableSpan,
      )
      expect(endedSpans.length).toBe(2)

      // Find parent and child spans
      const parentSpan = endedSpans.find((s) => s.name === 'parent-trace')
      const childSpan = endedSpans.find((s) => s.name === 'openai / gpt-4o')

      expect(parentSpan).toBeDefined()
      expect(childSpan).toBeDefined()

      // Child span should have parent span as its parent
      expect(childSpan!.parentSpanId).toBe(parentSpan!.spanContext().spanId)

      // Child span should have baggage attributes propagated
      const childAttrs = childSpan!.attributes
      expect(childAttrs['latitude.projectId']).toBe('456')
      expect(childAttrs['latitude.commitUuid']).toBe('parent-version')
      expect(childAttrs[ATTR_LATITUDE_PROMPT_PATH]).toBe('test/path')
    }),
  )

  it(
    'spans created outside trace() do NOT inherit metadata',
    gatewayMock.boundary(async () => {
      const processorMock = new MockSpanProcessor()

      const sdk = new LatitudeTelemetry('fake-api-key', {
        disableBatch: true,
        processors: [processorMock],
      })

      mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      // First, create a traced span
      await sdk.trace(
        {
          projectId: 789,
          versionUuid: 'traced-version',
          promptPath: 'traced/path',
        },
        async () => {
          return 'traced result'
        },
      )

      // Then, create a span OUTSIDE the trace
      const completion = sdk.completion(context.active(), {
        provider: 'anthropic',
        model: 'claude-3',
        configuration: { model: 'claude-3' },
        input: [{ role: 'user', content: 'Outside trace' }],
      })
      completion.end({
        output: [{ role: 'assistant', content: 'Response' }],
        tokens: { prompt: 3, cached: 0, reasoning: 0, completion: 1 },
        finishReason: 'stop',
      })

      await sdk.shutdown()

      // Get all spans
      const endedSpans = processorMock.onEnd.mock.calls.map(
        (call) => call[0] as ReadableSpan,
      )

      // Find the outside span
      const outsideSpan = endedSpans.find(
        (s) => s.name === 'anthropic / claude-3',
      )
      expect(outsideSpan).toBeDefined()

      // Outside span should NOT have the trace metadata
      const outsideAttrs = outsideSpan!.attributes
      expect(outsideAttrs['latitude.projectId']).toBeUndefined()
      expect(outsideAttrs['latitude.commitUuid']).toBeUndefined()
      expect(outsideAttrs[ATTR_LATITUDE_PROMPT_PATH]).toBeUndefined()

      // Should NOT have a parent span from the trace
      expect(outsideSpan!.parentSpanId).toBeUndefined()
    }),
  )

  it(
    'concurrent traces do not interfere with each other',
    gatewayMock.boundary(async () => {
      const processorMock = new MockSpanProcessor()

      const sdk = new LatitudeTelemetry('fake-api-key', {
        disableBatch: true,
        processors: [processorMock],
      })

      mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      // Run two traces concurrently with different metadata
      await Promise.all([
        sdk.trace(
          {
            name: 'trace-A',
            projectId: 111,
            promptPath: 'path/A',
          },
          async () => {
            // Small delay to ensure overlap
            await new Promise((resolve) => setTimeout(resolve, 20))
            const completion = sdk.completion(context.active(), {
              provider: 'openai',
              model: 'gpt-4',
              configuration: { model: 'gpt-4' },
              input: [{ role: 'user', content: 'A' }],
            })
            completion.end({
              output: [{ role: 'assistant', content: 'Response A' }],
              tokens: { prompt: 1, cached: 0, reasoning: 0, completion: 1 },
              finishReason: 'stop',
            })
            return 'A'
          },
        ),
        sdk.trace(
          {
            name: 'trace-B',
            projectId: 222,
            promptPath: 'path/B',
          },
          async () => {
            // Small delay to ensure overlap
            await new Promise((resolve) => setTimeout(resolve, 10))
            const completion = sdk.completion(context.active(), {
              provider: 'anthropic',
              model: 'claude',
              configuration: { model: 'claude' },
              input: [{ role: 'user', content: 'B' }],
            })
            completion.end({
              output: [{ role: 'assistant', content: 'Response B' }],
              tokens: { prompt: 1, cached: 0, reasoning: 0, completion: 1 },
              finishReason: 'stop',
            })
            return 'B'
          },
        ),
      ])

      await sdk.shutdown()

      // Get all spans
      const endedSpans = processorMock.onEnd.mock.calls.map(
        (call) => call[0] as ReadableSpan,
      )

      // Find parent traces
      const traceA = endedSpans.find((s) => s.name === 'trace-A')
      const traceB = endedSpans.find((s) => s.name === 'trace-B')

      expect(traceA).toBeDefined()
      expect(traceB).toBeDefined()

      // Find child completions
      const childA = endedSpans.find((s) => s.name === 'openai / gpt-4')
      const childB = endedSpans.find((s) => s.name === 'anthropic / claude')

      expect(childA).toBeDefined()
      expect(childB).toBeDefined()

      // Child A should be parented to trace A and have A's metadata
      expect(childA!.parentSpanId).toBe(traceA!.spanContext().spanId)
      expect(childA!.attributes['latitude.projectId']).toBe('111')
      expect(childA!.attributes[ATTR_LATITUDE_PROMPT_PATH]).toBe('path/A')

      // Child B should be parented to trace B and have B's metadata
      expect(childB!.parentSpanId).toBe(traceB!.spanContext().spanId)
      expect(childB!.attributes['latitude.projectId']).toBe('222')
      expect(childB!.attributes[ATTR_LATITUDE_PROMPT_PATH]).toBe('path/B')
    }),
  )

  it(
    'trace() propagates errors correctly',
    gatewayMock.boundary(async () => {
      const processorMock = new MockSpanProcessor()

      const sdk = new LatitudeTelemetry('fake-api-key', {
        disableBatch: true,
        processors: [processorMock],
      })

      mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const testError = new Error('Test error message')

      await expect(
        sdk.trace({ name: 'error-trace', projectId: 999 }, async () => {
          throw testError
        }),
      ).rejects.toThrow('Test error message')

      await sdk.shutdown()

      // Get the trace span
      const endedSpans = processorMock.onEnd.mock.calls.map(
        (call) => call[0] as ReadableSpan,
      )
      const errorSpan = endedSpans.find((s) => s.name === 'error-trace')

      expect(errorSpan).toBeDefined()
      expect(errorSpan!.status.code).toBe(2) // SpanStatusCode.ERROR
      expect(errorSpan!.status.message).toBe('Test error message')
    }),
  )

  it(
    'uses HEAD_COMMIT when versionUuid is not provided',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        disableBatch: true,
      })

      await sdk.trace(
        {
          projectId: 123,
          promptPath: 'some/path',
          // No versionUuid provided
        },
        async () => 'result',
      )

      await sdk.shutdown()

      expect(bodyMock).toHaveBeenCalled()
      const body = bodyMock.mock.calls[0]![0]
      const promptSpan = body.resourceSpans[0].scopeSpans[0].spans[0]

      // Should use HEAD_COMMIT as default
      expect(promptSpan.attributes).toContainEqual({
        key: 'latitude.commitUuid',
        value: { stringValue: HEAD_COMMIT },
      })
    }),
  )

  it(
    'wrap() creates a reusable traced function',
    gatewayMock.boundary(async () => {
      const processorMock = new MockSpanProcessor()

      const sdk = new LatitudeTelemetry('fake-api-key', {
        disableBatch: true,
        processors: [processorMock],
      })

      mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      // Create a wrapped function
      const tracedFn = sdk.wrap(
        async (input: string) => {
          const completion = sdk.completion(context.active(), {
            provider: 'test',
            model: 'test-model',
            configuration: {},
            input: [{ role: 'user', content: input }],
          })
          completion.end({
            output: [{ role: 'assistant', content: 'response' }],
            tokens: { prompt: 1, cached: 0, reasoning: 0, completion: 1 },
            finishReason: 'stop',
          })
          return `processed: ${input}`
        },
        {
          name: 'wrapped-trace',
          projectId: 555,
          promptPath: 'wrapped/path',
        },
      )

      // Call the wrapped function
      const result = await tracedFn('test-input')
      expect(result).toBe('processed: test-input')

      await sdk.shutdown()

      // Verify spans were created correctly
      const endedSpans = processorMock.onEnd.mock.calls.map(
        (call) => call[0] as ReadableSpan,
      )

      const parentSpan = endedSpans.find((s) => s.name === 'wrapped-trace')
      const childSpan = endedSpans.find((s) => s.name === 'test / test-model')

      expect(parentSpan).toBeDefined()
      expect(childSpan).toBeDefined()
      expect(childSpan!.parentSpanId).toBe(parentSpan!.spanContext().spanId)
      expect(childSpan!.attributes['latitude.projectId']).toBe('555')
    }),
  )
})

