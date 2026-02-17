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

  it(
    'propagates trace references via baggage to child spans using context.with',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      // Set up trace references in the context using setAttributes
      const ctx = sdk.context.setAttributes(sdk.context.active(), {
        'latitude.documentLogUuid': 'doc-log-123',
        'latitude.documentUuid': 'prompt-456',
        'latitude.commitUuid': 'commit-789',
        'latitude.projectId': '42',
        'latitude.testDeploymentId': '7',
        'latitude.source': 'api',
      })

      // Create a tool span within the context with references
      // Using context.with() makes the context active, so spans automatically inherit it
      sdk.context.with(ctx, () => {
        // No need to pass ctx - uses active context automatically
        const tool = sdk.span.tool({
          name: 'my-tool',
          call: { id: 'call-1', arguments: { foo: 'bar' } },
        })
        tool.end({ result: { value: 'success', isError: false } })
      })

      await sdk.shutdown()

      // Verify Latitude baggage attributes are normalized to snake_case
      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: [
          expect.objectContaining({
            scopeSpans: [
              expect.objectContaining({
                spans: [
                  expect.objectContaining({
                    attributes: expect.arrayContaining([
                      {
                        key: 'latitude.document_log_uuid',
                        value: { stringValue: 'doc-log-123' },
                      },
                      {
                        key: 'latitude.document_uuid',
                        value: { stringValue: 'prompt-456' },
                      },
                      {
                        key: 'latitude.commit_uuid',
                        value: { stringValue: 'commit-789' },
                      },
                      {
                        key: 'latitude.project_id',
                        value: { stringValue: '42' },
                      },
                      {
                        key: 'latitude.test_deployment_id',
                        value: { stringValue: '7' },
                      },
                      {
                        key: 'latitude.source',
                        value: { stringValue: 'api' },
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
    'propagates generic context attributes to child spans',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      // Set up generic context attributes
      const ctx = sdk.context.setAttributes(sdk.context.active(), {
        'latitude.documentUuid': 'doc-789',
        'custom.attribute': 'custom-value',
        'myapp.traceId': 'trace-123',
      })

      // Create a span within the context
      sdk.context.with(ctx, () => {
        const span = sdk.span.span({ name: 'my-span' })
        span.end()
      })

      await sdk.shutdown()

      // Verify Latitude baggage attributes are normalized to snake_case
      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: [
          expect.objectContaining({
            scopeSpans: [
              expect.objectContaining({
                spans: [
                  expect.objectContaining({
                    attributes: expect.arrayContaining([
                      {
                        key: 'latitude.document_uuid',
                        value: { stringValue: 'doc-789' },
                      },
                      {
                        key: 'custom.attribute',
                        value: { stringValue: 'custom-value' },
                      },
                      {
                        key: 'myapp.traceId',
                        value: { stringValue: 'trace-123' },
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
})
