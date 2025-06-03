import { LatitudeTelemetry, RedactSpanProcessor } from '$telemetry/index'
import { context } from '@opentelemetry/api'
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
import { mockRequest } from '../utils'

vi.hoisted(() => {
  process.env.GATEWAY_BASE_URL = 'https://fake-host.com'
  process.env.npm_package_name = 'fake-service-name'
  process.env.npm_package_version = 'fake-scope-version'
})

describe('redact', () => {
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
    'succeeds when using redact span processor',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/otlp/v1/traces',
      })

      const processor = new RedactSpanProcessor({
        attributes: ['gen_ai.system', /^gen_ai\.usage\..*/],
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        processors: [processor],
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

      expect(bodyMock).toHaveBeenCalledWith({
        resourceSpans: [
          expect.objectContaining({
            scopeSpans: [
              expect.objectContaining({
                spans: [
                  expect.objectContaining({
                    attributes: expect.arrayContaining([
                      {
                        key: 'gen_ai.system',
                        value: {
                          stringValue: '******',
                        },
                      },
                      {
                        key: 'gen_ai.request.model',
                        value: {
                          stringValue: 'gpt-4o',
                        },
                      },
                      {
                        key: 'gen_ai.usage.input_tokens',
                        value: {
                          stringValue: '******',
                        },
                      },
                      {
                        key: 'gen_ai.usage.output_tokens',
                        value: {
                          stringValue: '******',
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
})
