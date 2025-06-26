import { expect } from 'vitest'
import { expectMasked } from '../utils'

export const MANUAL_SPANS = {
  resourceSpans: [
    {
      resource: {
        attributes: expect.arrayContaining([
          {
            key: 'service.name',
            value: {
              stringValue: 'fake-service-name',
            },
          },
          {
            key: 'telemetry.sdk.language',
            value: {
              stringValue: 'nodejs',
            },
          },
          {
            key: 'telemetry.sdk.name',
            value: {
              stringValue: 'opentelemetry',
            },
          },
          {
            key: 'telemetry.sdk.version',
            value: {
              stringValue: expect.any(String),
            },
          },
        ]),
        droppedAttributesCount: expect.any(Number),
      },
      scopeSpans: [
        {
          scope: {
            name: 'so.latitude.instrumentation.manual',
            version: 'fake-scope-version',
          },
          spans: expect.arrayContaining([
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'POST https://openai.com/v1/chat/completions',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'http',
                  },
                },
                {
                  key: 'http.request.method',
                  value: {
                    stringValue: 'POST',
                  },
                },
                {
                  key: 'http.request.url',
                  value: {
                    stringValue: 'https://openai.com/v1/chat/completions',
                  },
                },
                {
                  key: 'http.request.header.content-type',
                  value: {
                    stringValue: 'application/json',
                  },
                },
                {
                  key: 'http.request.body',
                  value: {
                    stringValue:
                      '{"model":"gpt-4o","temperature":0.5,"max_tokens":100,"messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"What is the weather in Barcelona?"}]}',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'http.response.status_code',
                  value: {
                    intValue: 200,
                  },
                },
                {
                  key: 'http.response.header.content-type',
                  value: {
                    stringValue: 'application/json',
                  },
                },
                {
                  key: 'http.response.body',
                  value: {
                    stringValue:
                      '{"id":"chatcmpl-abcdef123456","object":"chat.completion","model":"gpt-4o","choices":[{"index":0,"message":{"role":"assistant","content":"Hello, user, I will help you today with the brain tool!","function_call":{"name":"brain","arguments":"{\\"query\\": \\"What is the weather in Barcelona?\\"}"}},"finish_reason":"function_call"}],"usage":{"prompt_tokens":20,"cached_tokens":5,"reasoning_tokens":5,"completion_tokens":10,"total_tokens":40}}',
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'openai / gpt-4o',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.operation.name',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.system',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.configuration',
                  value: {
                    stringValue:
                      '{"temperature":0.5,"max_tokens":100,"model":"gpt-4o"}',
                  },
                },
                {
                  key: 'gen_ai.request.temperature',
                  value: {
                    doubleValue: 0.5,
                  },
                },
                {
                  key: 'gen_ai.request.max_tokens',
                  value: {
                    intValue: 100,
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"What is the weather in Barcelona?"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.role',
                  value: {
                    stringValue: 'system',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.content',
                  value: {
                    stringValue: 'You are a helpful assistant.',
                  },
                },
                {
                  key: 'gen_ai.prompt.1.role',
                  value: {
                    stringValue: 'user',
                  },
                },
                {
                  key: 'gen_ai.prompt.1.content',
                  value: {
                    stringValue: 'What is the weather in Barcelona?',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.response.messages',
                  value: {
                    stringValue:
                      '[{"role":"assistant","content":[{"type":"text","text":"Hello, user, I will help you today with the brain tool!"}],"tool_calls":[{"id":"tool_call_id_1","type":"function","function":{"name":"brain","arguments":"{\\"query\\": \\"What is the weather in Barcelona?\\"}"}}]}]',
                  },
                },
                {
                  key: 'gen_ai.completion.0.role',
                  value: {
                    stringValue: 'assistant',
                  },
                },
                {
                  key: 'gen_ai.completion.0.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"Hello, user, I will help you today with the brain tool!"}]',
                  },
                },
                {
                  key: 'gen_ai.completion.0.tool_calls.0.id',
                  value: {
                    stringValue: 'tool_call_id_1',
                  },
                },
                {
                  key: 'gen_ai.completion.0.tool_calls.0.name',
                  value: {
                    stringValue: 'brain',
                  },
                },
                {
                  key: 'gen_ai.completion.0.tool_calls.0.arguments',
                  value: {
                    stringValue:
                      '{"query": "What is the weather in Barcelona?"}',
                  },
                },
                {
                  key: 'gen_ai.usage.input_tokens',
                  value: {
                    intValue: 25,
                  },
                },
                {
                  key: 'gen_ai.usage.prompt_tokens',
                  value: {
                    intValue: 20,
                  },
                },
                {
                  key: 'gen_ai.usage.cached_tokens',
                  value: {
                    intValue: 5,
                  },
                },
                {
                  key: 'gen_ai.usage.reasoning_tokens',
                  value: {
                    intValue: 5,
                  },
                },
                {
                  key: 'gen_ai.usage.completion_tokens',
                  value: {
                    intValue: 10,
                  },
                },
                {
                  key: 'gen_ai.usage.output_tokens',
                  value: {
                    intValue: 15,
                  },
                },
                {
                  key: 'gen_ai.response.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.response.finish_reasons',
                  value: {
                    arrayValue: {
                      values: [
                        {
                          stringValue: 'tool_calls',
                        },
                      ],
                    },
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'brain',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'tool',
                  },
                },
                {
                  key: 'gen_ai.operation.name',
                  value: {
                    stringValue: 'tool',
                  },
                },
                {
                  key: 'gen_ai.tool.name',
                  value: {
                    stringValue: 'brain',
                  },
                },
                {
                  key: 'gen_ai.tool.type',
                  value: {
                    stringValue: 'function',
                  },
                },
                {
                  key: 'gen_ai.tool.call.id',
                  value: {
                    stringValue: 'tool_call_id_1',
                  },
                },
                {
                  key: 'gen_ai.tool.call.arguments',
                  value: {
                    stringValue:
                      '{"query":"What is the weather in Barcelona?"}',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.tool.result.value',
                  value: {
                    stringValue: 'The weather in Barcelona is sunny.',
                  },
                },
                {
                  key: 'gen_ai.tool.result.is_error',
                  value: {
                    boolValue: false,
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'step',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'segment',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'openai / gpt-4o',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.operation.name',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.system',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.configuration',
                  value: {
                    stringValue:
                      '{"temperature":0.5,"max_tokens":100,"model":"gpt-4o"}',
                  },
                },
                {
                  key: 'gen_ai.request.temperature',
                  value: {
                    doubleValue: 0.5,
                  },
                },
                {
                  key: 'gen_ai.request.max_tokens',
                  value: {
                    intValue: 100,
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"user","content":"Nice, thank you!"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.role',
                  value: {
                    stringValue: 'user',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.content',
                  value: {
                    stringValue: 'Nice, thank you!',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [
                {
                  attributes: expect.arrayContaining([
                    {
                      key: 'exception.type',
                      value: {
                        stringValue: 'Error',
                      },
                    },
                    {
                      key: 'exception.message',
                      value: {
                        stringValue: 'Error in completion',
                      },
                    },
                    {
                      key: 'exception.stacktrace',
                      value: {
                        stringValue: expect.any(String),
                      },
                    },
                  ]),
                  name: 'exception',
                  timeUnixNano: expect.any(String),
                  droppedAttributesCount: expect.any(Number),
                },
              ],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 2,
                message: 'Error in completion',
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'step',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'segment',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'openai / gpt-4o',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.operation.name',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.system',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.configuration',
                  value: {
                    stringValue:
                      '{"temperature":0.5,"max_tokens":100,"model":"gpt-4o"}',
                  },
                },
                {
                  key: 'gen_ai.request.temperature',
                  value: {
                    doubleValue: 0.5,
                  },
                },
                {
                  key: 'gen_ai.request.max_tokens',
                  value: {
                    intValue: 100,
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"user","content":"Wait, it did not work!"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.role',
                  value: {
                    stringValue: 'user',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.content',
                  value: {
                    stringValue: 'Wait, it did not work!',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"playground","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [
                {
                  attributes: expect.arrayContaining([
                    {
                      key: 'exception.type',
                      value: {
                        stringValue: 'Error',
                      },
                    },
                    {
                      key: 'exception.message',
                      value: {
                        stringValue: 'Error in completion',
                      },
                    },
                    {
                      key: 'exception.stacktrace',
                      value: {
                        stringValue: expect.any(String),
                      },
                    },
                  ]),
                  name: 'exception',
                  timeUnixNano: expect.any(String),
                  droppedAttributesCount: expect.any(Number),
                },
              ],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 2,
                message: 'Error in completion',
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'step',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'segment',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"playground","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              name: 'document',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'segment',
                  },
                },
                {
                  key: 'gen_ai.request.template',
                  value: {
                    stringValue:
                      "---\nprovider: openai\nmodel: gpt-4o\ntemperature: 0.5\nmax_tokens: 100\ntools: ['brain']\n---\n\nYou are a helpful assistant.\n<user>{{question}}</user>",
                  },
                },
                {
                  key: 'gen_ai.request.parameters',
                  value: {
                    stringValue:
                      '{"question":"What is the weather in Barcelona?"}',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'fix',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'tool',
                  },
                },
                {
                  key: 'gen_ai.operation.name',
                  value: {
                    stringValue: 'tool',
                  },
                },
                {
                  key: 'gen_ai.tool.name',
                  value: {
                    stringValue: 'fix',
                  },
                },
                {
                  key: 'gen_ai.tool.type',
                  value: {
                    stringValue: 'function',
                  },
                },
                {
                  key: 'gen_ai.tool.call.id',
                  value: {
                    stringValue: 'tool_call_id_2',
                  },
                },
                {
                  key: 'gen_ai.tool.call.arguments',
                  value: {
                    stringValue: '{"command":"Fix the error!"}',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"playground","type":"step","traceparent":"%ANY%","paused":true}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.tool.result.value',
                  value: {
                    stringValue: 'The error could not be fixed.',
                  },
                },
                {
                  key: 'gen_ai.tool.result.is_error',
                  value: {
                    boolValue: true,
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'openai / gpt-4o',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.operation.name',
                  value: {
                    stringValue: 'completion',
                  },
                },
                {
                  key: 'gen_ai.system',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.configuration',
                  value: {
                    stringValue:
                      '{"temperature":0.5,"max_tokens":100,"model":"gpt-4o"}',
                  },
                },
                {
                  key: 'gen_ai.request.temperature',
                  value: {
                    doubleValue: 0.5,
                  },
                },
                {
                  key: 'gen_ai.request.max_tokens',
                  value: {
                    intValue: 100,
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"user","content":"Still not working!"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.role',
                  value: {
                    stringValue: 'user',
                  },
                },
                {
                  key: 'gen_ai.prompt.0.content',
                  value: {
                    stringValue: 'Still not working!',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"experiment","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [
                {
                  attributes: expect.arrayContaining([
                    {
                      key: 'exception.type',
                      value: {
                        stringValue: 'Error',
                      },
                    },
                    {
                      key: 'exception.message',
                      value: {
                        stringValue: 'Error in completion',
                      },
                    },
                    {
                      key: 'exception.stacktrace',
                      value: {
                        stringValue: expect.any(String),
                      },
                    },
                  ]),
                  name: 'exception',
                  timeUnixNano: expect.any(String),
                  droppedAttributesCount: expect.any(Number),
                },
              ],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 2,
                message: 'Error in completion',
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
            {
              traceId: expect.any(String),
              spanId: expect.any(String),
              parentSpanId: expect.any(String),
              name: 'step',
              kind: 3,
              startTimeUnixNano: expect.any(String),
              endTimeUnixNano: expect.any(String),
              attributes: expect.arrayContaining([
                {
                  key: 'latitude.type',
                  value: {
                    stringValue: 'segment',
                  },
                },
                {
                  key: 'latitude.segment.id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segment.parent_id',
                  value: {
                    stringValue: expect.any(String),
                  },
                },
                {
                  key: 'latitude.segments',
                  value: {
                    stringValue: expectMasked(
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"live","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"experiment","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
              ]),
              droppedAttributesCount: expect.any(Number),
              events: [],
              droppedEventsCount: expect.any(Number),
              status: {
                code: 1,
              },
              links: [],
              droppedLinksCount: expect.any(Number),
            },
          ]),
        },
      ],
    },
  ],
}
