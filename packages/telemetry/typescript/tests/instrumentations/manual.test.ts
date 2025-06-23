import {
  BACKGROUND,
  LatitudeTelemetry,
  TelemetryContext,
} from '$telemetry/index'
import { SegmentSource } from '@latitude-data/constants'
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

      const _requestHttp1 = (ctx: TelemetryContext) => {
        const http = sdk.http(ctx, {
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
        // Nothing
        http.end({
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
                cached_tokens: 5,
                reasoning_tokens: 5,
                completion_tokens: 10,
                total_tokens: 40,
              },
            },
          },
        })
      }

      const _generateCompletion1 = (ctx: TelemetryContext) => {
        const completion = sdk.completion(ctx, {
          provider: 'openai',
          model: 'gpt-4o',
          configuration: { temperature: 0.5, max_tokens: 100 },
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
        _requestHttp1(completion.context)
        completion.end({
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
                    arguments: '{"query": "What is the weather in Barcelona?"}',
                  },
                },
              ],
            },
          ],
          tokens: {
            prompt: 20,
            cached: 5,
            reasoning: 5,
            completion: 10,
          },
          finishReason: 'tool_calls',
        })
      }
      const _generateCompletion2 = (ctx: TelemetryContext) => {
        const completion = sdk.completion(ctx, {
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
        // Nothing
        completion.fail(new Error('Error in completion'))
      }
      const _generateCompletion3 = (ctx: TelemetryContext) => {
        const completion = sdk.completion(ctx, {
          provider: 'openai',
          model: 'gpt-4o',
          configuration: { temperature: 0.5, max_tokens: 100 },
          input: [
            {
              role: 'user',
              content: 'Wait, it did not work!',
            },
          ],
        })
        // Nothing
        completion.fail(new Error('Error in completion'))
      }
      const _generateCompletion4 = (ctx: TelemetryContext) => {
        const completion = sdk.completion(ctx, {
          provider: 'openai',
          model: 'gpt-4o',
          configuration: { temperature: 0.5, max_tokens: 100 },
          input: [
            {
              role: 'user',
              content: 'Still not working!',
            },
          ],
        })
        // Nothing
        completion.fail(new Error('Error in completion'))
      }

      const _handleTool1 = (ctx: TelemetryContext) => {
        const tool = sdk.tool(ctx, {
          name: 'brain',
          call: {
            id: 'tool_call_id_1',
            arguments: {
              query: 'What is the weather in Barcelona?',
            },
          },
        })
        // Nothing
        tool.end({
          result: {
            value: 'The weather in Barcelona is sunny.',
            isError: false,
          },
        })
      }
      const _handleTool2 = (ctx: TelemetryContext) => {
        const tool = sdk.tool(ctx, {
          name: 'fix',
          call: {
            id: 'tool_call_id_2',
            arguments: {
              command: 'Fix the error!',
            },
          },
        })
        // Nothing
        tool.end({
          result: {
            value: 'The error could not be fixed.',
            isError: true,
          },
        })
      }

      const _executeStep1 = (ctx: TelemetryContext) => {
        const step = sdk.step(ctx)
        _generateCompletion1(step.context)
        _handleTool1(step.context)
        step.end()
      }
      const _executeStep2 = (ctx: TelemetryContext) => {
        const step = sdk.step(ctx)
        _generateCompletion2(step.context)
        step.end()
      }
      const _executeStep3 = (ctx: TelemetryContext) => {
        const step = sdk.step(ctx, {
          _internal: {
            id: 'other-step-id',
            source: SegmentSource.Playground,
          },
        })
        _generateCompletion3(step.context)
        const trace = sdk.pause(step.context)
        step.end()
        return trace
      }
      const _executeStep4 = (ctx: TelemetryContext) => {
        const step = sdk.step(ctx, {
          _internal: { source: SegmentSource.Experiment },
        })
        _generateCompletion4(step.context)
        step.end()
      }

      const _runPrompt1 = (ctx: TelemetryContext) => {
        const prompt = sdk.prompt(ctx, {
          promptUuid: 'fake-document-uuid',
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
        })
        _executeStep1(prompt.context)
        _executeStep2(prompt.context)
        const trace = _executeStep3(prompt.context)
        prompt.end()
        return trace
      }

      const trace = _runPrompt1(BACKGROUND())
      // ...trace is resumed
      let ctx = sdk.resume(trace)
      _handleTool2(ctx)
      // ...trace is restored
      if (!sdk.restored(ctx)) ctx = sdk.restore(ctx)
      _executeStep4(ctx)

      await sdk.shutdown()

      expect(bodyMock).toHaveBeenCalledWith(fixtures.MANUAL_SPANS)
    }),
  )
})
