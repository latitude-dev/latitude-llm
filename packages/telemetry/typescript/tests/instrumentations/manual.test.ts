import { LatitudeTelemetry } from '$telemetry/index'
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
import * as fixtures from '../fixtures'
import { mockRequest } from '../utils'

vi.hoisted(() => {
  process.env.GATEWAY_BASE_URL = 'https://fake-host.com'
  process.env.npm_package_name = 'fake-service-name'
  process.env.npm_package_version = 'fake-scope-version'
})

describe('manual', () => {
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
    'succeeds when instrumenting manually',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/otlp/v1/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      await sdk.document(
        {
          documentUuid: 'fake-document-uuid',
        },
        async () => {
          await sdk.step(
            {
              name: 'Step 1',
            },
            async () => {
              const [ctx, endCompletion] = sdk.completion(context.active(), {
                provider: 'openai',
                model: 'gpt-4o',
                configuration: { temperature: 0.5, max_tokens: 100 },
                template: `
---
provider: openai
model: gpt-4o
temperature: 0.5
max_tokens: 100
tools: ['brain']
---

You are a helpful assistant.
<user>{{question}}</user>
`.trim(),
                parameters: {
                  question: 'What is the weather in Barcelona?',
                },
                input: [
                  {
                    role: 'system',
                    content: 'You are a helpful assistant.',
                  },
                  {
                    role: 'user',
                    content: 'What is the weather in Barcelona?',
                  },
                ],
              })

              const [_, endHttp] = sdk.http(ctx, {
                request: {
                  method: 'POST',
                  url: 'https://openai.com/v1/chat/completions',
                  headers: {
                    'content-type': 'application/json',
                  },
                  body: {
                    model: 'gpt-4o',
                    temperature: 0.5,
                    max_tokens: 100,
                    messages: [
                      {
                        role: 'system',
                        content: 'You are a helpful assistant.',
                      },
                      {
                        role: 'user',
                        content: 'What is the weather in Barcelona?',
                      },
                    ],
                  },
                },
              })

              endHttp({
                response: {
                  status: 200,
                  headers: {
                    'content-type': 'application/json',
                  },
                  body: {
                    id: 'chatcmpl-abcdef123456',
                    object: 'chat.completion',
                    model: 'gpt-4o',
                    choices: [
                      {
                        index: 0,
                        message: {
                          role: 'assistant',
                          content:
                            'Hello, user, I will help you today with the brain tool!',
                          function_call: {
                            name: 'brain',
                            arguments:
                              '{"query": "What is the weather in Barcelona?"}',
                          },
                        },
                        finish_reason: 'function_call',
                      },
                    ],
                    usage: {
                      prompt_tokens: 20,
                      completion_tokens: 10,
                      total_tokens: 30,
                    },
                  },
                },
              })

              endCompletion({
                output: [
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'text',
                        text: 'Hello, user, I will help you today with the brain tool!',
                      },
                    ],
                    tool_calls: [
                      {
                        id: 'tool_call_id_1',
                        type: 'function',
                        function: {
                          name: 'brain',
                          arguments:
                            '{"query": "What is the weather in Barcelona?"}',
                        },
                      },
                    ],
                  },
                ],
                tokens: { input: 20, output: 10 },
                finishReason: 'tool_calls',
              })

              const [__, endTool] = sdk.tool(ctx, {
                name: 'brain',
                call: {
                  id: 'tool_call_id_1',
                  arguments: {
                    query: 'What is the weather in Barcelona?',
                  },
                },
              })

              endTool({
                result: {
                  value: 'The weather in Barcelona is sunny.',
                  isError: false,
                },
              })
            },
          )

          await sdk.step(
            {
              name: 'Step 2',
            },
            async () => {
              const [_, __, endCompletion] = sdk.completion(context.active(), {
                provider: 'openai',
                model: 'gpt-4o',
                configuration: { temperature: 0.5, max_tokens: 100 },
                input: [
                  {
                    role: 'user',
                    content: 'Nice, thank you!',
                  },
                ],
              })

              endCompletion(new Error('Error in completion'))
            },
          )
        },
      )

      await sdk.shutdown()

      expect(bodyMock).toHaveBeenCalledWith(fixtures.MANUAL_SPANS)
    }),
  )
})
