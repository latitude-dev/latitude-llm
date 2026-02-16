import { LatitudeTelemetry } from '$telemetry/index'
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
import { mockRequest, normalizeBody } from '../utils'

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
    'sends correct spans for prompt with completion, HTTP, tool, and final completion',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      const ctx = sdk.context.setAttributes(sdk.context.active(), {
        'latitude.documentLogUuid': 'fake-doc-log-uuid',
        'latitude.documentUuid': 'fake-prompt-uuid',
      })

      const prompt = sdk.span.prompt(
        {
          template:
            '---\nprovider: openai\nmodel: gpt-4o\ntemperature: 0.5\n---\nYou are helpful.\n<user>{{question}}</user>',
          parameters: { question: 'What is the weather?' },
        },
        ctx,
      )

      const completion1 = sdk.span.completion(
        {
          provider: 'openai',
          model: 'gpt-4o',
          configuration: { temperature: 0.5, model: 'gpt-4o' },
          input: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'What is the weather?' },
          ],
        },
        prompt.context,
      )

      const http1 = sdk.span.http(
        {
          request: {
            method: 'POST',
            url: 'https://api.openai.com/v1/chat/completions',
            headers: { 'Content-Type': 'application/json' },
            body: {
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'What is the weather?' },
              ],
            },
          },
        },
        completion1.context,
      )

      http1.end({
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Let me check the weather for you.',
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'get_weather',
                        arguments: '{"city":"NYC"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 15 },
          },
        },
      })

      completion1.end({
        output: [
          {
            role: 'assistant',
            content: 'Let me check the weather for you.',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              },
            ],
          },
        ],
        tokens: { prompt: 20, cached: 0, reasoning: 0, completion: 15 },
        finishReason: 'tool_calls',
      })

      const tool = sdk.span.tool(
        {
          name: 'get_weather',
          call: { id: 'call_1', arguments: { city: 'NYC' } },
        },
        prompt.context,
      )

      tool.end({
        result: {
          value: { weather: 'sunny', temp: 72 },
          isError: false,
        },
      })

      const completion2 = sdk.span.completion(
        {
          provider: 'openai',
          model: 'gpt-4o',
          configuration: { temperature: 0.5, model: 'gpt-4o' },
          input: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'What is the weather?' },
            {
              role: 'assistant',
              content: 'Let me check the weather for you.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"NYC"}',
                  },
                },
              ],
            },
            {
              role: 'tool',
              content: '{"weather":"sunny","temp":72}',
              tool_call_id: 'call_1',
            },
          ],
        },
        prompt.context,
      )

      const http2 = sdk.span.http(
        {
          request: {
            method: 'POST',
            url: 'https://api.openai.com/v1/chat/completions',
            headers: { 'Content-Type': 'application/json' },
            body: { model: 'gpt-4o' },
          },
        },
        completion2.context,
      )

      http2.end({
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'The weather in NYC is sunny, 72F!',
                },
                finish_reason: 'stop',
              },
            ],
          },
        },
      })

      completion2.end({
        output: [
          {
            role: 'assistant',
            content: 'The weather in NYC is sunny, 72F!',
          },
        ],
        tokens: { prompt: 40, cached: 5, reasoning: 0, completion: 10 },
        finishReason: 'stop',
      })

      prompt.end()

      await sdk.shutdown()

      const body = bodyMock.mock.calls[0]![0]
      expect(normalizeBody(body)).toEqual(
        normalizeBody(fixtures.MANUAL_PROMPT_WITH_TOOLS_SPANS as any),
      )
    }),
  )

  it(
    'records error correctly when completion fails',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key')

      const completion = sdk.span.completion({
        provider: 'openai',
        model: 'gpt-4o',
        configuration: { model: 'gpt-4o' },
        input: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
      })

      completion.fail(new Error('LLM provider error'))

      await sdk.shutdown()

      const body = bodyMock.mock.calls[0]![0]
      expect(normalizeBody(body)).toEqual(
        normalizeBody(fixtures.MANUAL_COMPLETION_ERROR_SPANS as any),
      )
    }),
  )
})
