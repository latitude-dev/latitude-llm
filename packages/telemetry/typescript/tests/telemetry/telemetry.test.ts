import { LatitudeTelemetry } from '$telemetry/index'
import { context } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
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

describe('telemetry', () => {
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
    'succeeds when using default span exporter',
    gatewayMock.boundary(async () => {
      const { headersMock, methodMock, endpointMock, bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/otlp/v1/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      const [_, ok] = sdk.completion(context.active(), {
        provider: 'openai',
        model: 'gpt-4o',
        configuration: { model: 'gpt-4o' },
        input: [{ role: 'user', content: 'Hello, assistant!' }],
      })
      ok({
        output: [{ role: 'assistant', content: 'Hello, user!' }],
        tokens: { input: 20, output: 10 },
        finishReason: 'stop',
      })

      await sdk.shutdown()

      expect(headersMock).toHaveBeenCalledWith(
        expect.objectContaining({
          authorization: 'Bearer fake-api-key',
          'content-type': 'application/json',
        }),
      )
      expect(methodMock).toHaveBeenCalledWith('POST')
      expect(endpointMock).toHaveBeenCalledWith('/api/v3/otlp/v1/traces')
      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: expect.any(Array),
      })
    }),
  )

  it(
    'succeeds when using custom span exporter',
    gatewayMock.boundary(async () => {
      const { headersMock, methodMock, endpointMock, bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/otlp/v1/traces',
        baseUrl: 'https://custom-host.com',
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        exporter: new OTLPTraceExporter({
          url: 'https://custom-host.com/api/v3/otlp/v1/traces',
          headers: {
            Authorization: `Bearer fake-api-key`,
            'Content-Type': 'application/json',
          },
        }),
      })

      const [_, ok] = sdk.completion(context.active(), {
        provider: 'openai',
        model: 'gpt-4o',
        configuration: { model: 'gpt-4o' },
        input: [{ role: 'user', content: 'Hello, assistant!' }],
      })
      ok({
        output: [{ role: 'assistant', content: 'Hello, user!' }],
        tokens: { input: 20, output: 10 },
        finishReason: 'stop',
      })

      await sdk.shutdown()

      expect(headersMock).toHaveBeenCalledWith(
        expect.objectContaining({
          authorization: 'Bearer fake-api-key',
          'content-type': 'application/json',
        }),
      )
      expect(methodMock).toHaveBeenCalledWith('POST')
      expect(endpointMock).toHaveBeenCalledWith('/api/v3/otlp/v1/traces')
      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: expect.any(Array),
      })
    }),
  )

  it(
    'succeeds when using custom span processor',
    gatewayMock.boundary(async () => {
      const { headersMock, methodMock, endpointMock, bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/otlp/v1/traces',
      })

      const processorMock = new MockSpanProcessor()

      const sdk = new LatitudeTelemetry('fake-api-key', {
        processors: [processorMock],
      })

      const [_, ok] = sdk.completion(context.active(), {
        provider: 'openai',
        model: 'gpt-4o',
        configuration: { model: 'gpt-4o' },
        input: [{ role: 'user', content: 'Hello, assistant!' }],
      })
      ok({
        output: [{ role: 'assistant', content: 'Hello, user!' }],
        tokens: { input: 20, output: 10 },
        finishReason: 'stop',
      })

      await sdk.shutdown()

      expect(headersMock).toHaveBeenCalledWith(
        expect.objectContaining({
          authorization: 'Bearer fake-api-key',
          'content-type': 'application/json',
        }),
      )
      expect(methodMock).toHaveBeenCalledWith('POST')
      expect(endpointMock).toHaveBeenCalledWith('/api/v3/otlp/v1/traces')
      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: expect.any(Array),
      })
      expect(processorMock.onStart).toHaveBeenCalled()
      expect(processorMock.onEnd).toHaveBeenCalled()
      expect(processorMock.forceFlush).toHaveBeenCalled()
      expect(processorMock.shutdown).toHaveBeenCalled()
    }),
  )
})
