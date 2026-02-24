import { LatitudeTelemetry } from '$telemetry/index'
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
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      const completion = sdk.span.completion({
        provider: 'openai',
        model: 'gpt-4o',
        configuration: { model: 'gpt-4o' },
        input: [{ role: 'user', content: 'Hello, assistant!' }],
      })
      completion.end({
        output: [{ role: 'assistant', content: 'Hello, user!' }],
        tokens: { prompt: 20, cached: 0, reasoning: 0, completion: 10 },
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
      expect(endpointMock).toHaveBeenCalledWith('/api/v3/traces')
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
        endpoint: '/api/v3/traces',
        baseUrl: 'https://custom-host.com',
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        exporter: new OTLPTraceExporter({
          url: 'https://custom-host.com/api/v3/traces',
          headers: {
            Authorization: `Bearer fake-api-key`,
            'Content-Type': 'application/json',
          },
        }),
      })

      const completion = sdk.span.completion({
        provider: 'openai',
        model: 'gpt-4o',
        configuration: { model: 'gpt-4o' },
        input: [{ role: 'user', content: 'Hello, assistant!' }],
      })
      completion.end({
        output: [{ role: 'assistant', content: 'Hello, user!' }],
        tokens: { prompt: 20, cached: 0, reasoning: 0, completion: 10 },
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
      expect(endpointMock).toHaveBeenCalledWith('/api/v3/traces')
      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: expect.any(Array),
      })
    }),
  )

  it(
    'succeeds when using default span processor',
    gatewayMock.boundary(async () => {
      const { headersMock, methodMock, endpointMock, bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      const http = sdk.span.http({
        request: {
          method: 'POST',
          url: 'https://api.openai.com/v1/responses',
          headers: {
            Authorization: 'Bearer sk-9132kn132k13bn123',
            'Content-Type': 'application/json',
            Cookie: 'cookie',
          },
          body: {
            prompt: 'prompt',
          },
        },
      })
      http.end({
        response: {
          status: 200,
          headers: {
            'X-Refresh-Token': 'token',
            'Set-Cookie': 'cookie',
          },
          body: {
            completion: 'completion',
          },
        },
      })

      await sdk.shutdown()

      expect(headersMock).toHaveBeenCalledWith(
        expect.objectContaining({
          authorization: 'Bearer fake-api-key',
          'content-type': 'application/json',
        }),
      )
      expect(methodMock).toHaveBeenCalledWith('POST')
      expect(endpointMock).toHaveBeenCalledWith('/api/v3/traces')
      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: [
          expect.objectContaining({
            scopeSpans: [
              expect.objectContaining({
                spans: [
                  expect.objectContaining({
                    attributes: expect.arrayContaining([
                      {
                        key: 'http.request.header.authorization',
                        value: {
                          stringValue: '******',
                        },
                      },
                      {
                        key: 'http.request.header.content-type',
                        value: {
                          stringValue: 'application/json',
                        },
                      },
                      {
                        key: 'http.request.header.cookie',
                        value: {
                          stringValue: '******',
                        },
                      },
                      {
                        key: 'http.request.body',
                        value: {
                          stringValue: '{"prompt":"prompt"}',
                        },
                      },
                      {
                        key: 'http.response.header.x-refresh-token',
                        value: {
                          stringValue: '******',
                        },
                      },
                      {
                        key: 'http.response.header.set-cookie',
                        value: {
                          stringValue: '******',
                        },
                      },
                      {
                        key: 'http.response.body',
                        value: {
                          stringValue: '{"completion":"completion"}',
                        },
                      },
                    ]),
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    }),
  )

  it(
    'succeeds when using custom span processor',
    gatewayMock.boundary(async () => {
      const { headersMock, methodMock, endpointMock, bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const processorMock = new MockSpanProcessor()

      const sdk = new LatitudeTelemetry('fake-api-key', {
        processors: [processorMock],
      })

      const completion = sdk.span.completion({
        provider: 'openai',
        model: 'gpt-4o',
        configuration: { model: 'gpt-4o' },
        input: [{ role: 'user', content: 'Hello, assistant!' }],
      })
      completion.end({
        output: [{ role: 'assistant', content: 'Hello, user!' }],
        tokens: { prompt: 20, cached: 0, reasoning: 0, completion: 10 },
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
      expect(endpointMock).toHaveBeenCalledWith('/api/v3/traces')
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
