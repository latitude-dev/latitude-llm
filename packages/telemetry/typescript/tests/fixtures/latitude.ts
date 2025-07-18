import { expect } from 'vitest'
import { expectMasked } from '../utils'

export const LATITUDE_RENDERING_SPANS = {
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
            name: 'so.latitude.instrumentation.latitude',
            version: 'fake-scope-version',
          },
          spans: expect.arrayContaining([
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
                  value: { stringValue: 'completion' },
                },
                {
                  key: 'gen_ai.system',
                  value: { stringValue: 'openai' },
                },
                {
                  key: 'gen_ai.request.configuration',
                  value: {
                    stringValue:
                      '{"provider":"openai","model":"gpt-4o","type":"agent","temperature":0.5,"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the weather for a given location","parameters":{"location":{"type":"string","description":"The location to get the weather for"}}}}],"max_tokens":1000}',
                  },
                },
                {
                  key: 'gen_ai.request.provider',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.type',
                  value: {
                    stringValue: 'agent',
                  },
                },
                {
                  key: 'gen_ai.request.temperature',
                  value: { doubleValue: 0.5 },
                },
                {
                  key: 'gen_ai.request.max_tokens',
                  value: {
                    intValue: 1000,
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"system","content":"Think step by step about the user question:"},{"role":"user","content":[{"type":"text","text":"What is the weather in Barcelona?"}]}]',
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
                    stringValue: 'Think step by step about the user question:',
                  },
                },
                {
                  key: 'gen_ai.prompt.1.role',
                  value: { stringValue: 'user' },
                },
                {
                  key: 'gen_ai.prompt.1.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"What is the weather in Barcelona?"}]',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.response.messages',
                  value: {
                    stringValue:
                      '[{"role":"assistant","content":"The user asked for the weather."}]',
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
                    stringValue: 'The user asked for the weather.',
                  },
                },
                {
                  key: 'gen_ai.usage.input_tokens',
                  value: {
                    intValue: 19,
                  },
                },
                {
                  key: 'gen_ai.usage.prompt_tokens',
                  value: {
                    intValue: 19,
                  },
                },
                {
                  key: 'gen_ai.usage.cached_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.reasoning_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.completion_tokens',
                  value: {
                    intValue: 8,
                  },
                },
                {
                  key: 'gen_ai.usage.output_tokens',
                  value: {
                    intValue: 8,
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
                          stringValue: 'stop',
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
              name: 'Step',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
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
                      '{"provider":"openai","model":"gpt-4o","type":"agent","temperature":0.5,"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the weather for a given location","parameters":{"location":{"type":"string","description":"The location to get the weather for"}}}}],"max_tokens":1000}',
                  },
                },
                {
                  key: 'gen_ai.request.provider',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.type',
                  value: {
                    stringValue: 'agent',
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
                    intValue: 1000,
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"system","content":"Think step by step about the user question:"},{"role":"user","content":[{"type":"text","text":"What is the weather in Barcelona?"}]},{"role":"assistant","content":[{"type":"text","text":"The user asked for the weather."}]},{"role":"system","content":"Think harder."}]',
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
                    stringValue: 'Think step by step about the user question:',
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
                    stringValue:
                      '[{"type":"text","text":"What is the weather in Barcelona?"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.2.role',
                  value: {
                    stringValue: 'assistant',
                  },
                },
                {
                  key: 'gen_ai.prompt.2.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"The user asked for the weather."}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.3.role',
                  value: {
                    stringValue: 'system',
                  },
                },
                {
                  key: 'gen_ai.prompt.3.content',
                  value: {
                    stringValue: 'Think harder.',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.response.messages',
                  value: {
                    stringValue:
                      '[{"role":"assistant","content":"The user has asked specifically for the weather in Barcelona."}]',
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
                      'The user has asked specifically for the weather in Barcelona.',
                  },
                },
                {
                  key: 'gen_ai.usage.input_tokens',
                  value: {
                    intValue: 30,
                  },
                },
                {
                  key: 'gen_ai.usage.prompt_tokens',
                  value: {
                    intValue: 30,
                  },
                },
                {
                  key: 'gen_ai.usage.cached_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.reasoning_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.completion_tokens',
                  value: {
                    intValue: 16,
                  },
                },
                {
                  key: 'gen_ai.usage.output_tokens',
                  value: {
                    intValue: 16,
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
                          stringValue: 'stop',
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
              name: 'Step',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
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
                      '{"provider":"openai","model":"gpt-4o","type":"agent","temperature":0.5,"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the weather for a given location","parameters":{"location":{"type":"string","description":"The location to get the weather for"}}}}],"max_tokens":1000}',
                  },
                },
                {
                  key: 'gen_ai.request.provider',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.type',
                  value: {
                    stringValue: 'agent',
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
                    intValue: 1000,
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"system","content":"Think step by step about the user question:"},{"role":"user","content":[{"type":"text","text":"What is the weather in Barcelona?"}]},{"role":"assistant","content":[{"type":"text","text":"The user asked for the weather."}]},{"role":"system","content":"Think harder."},{"role":"assistant","content":[{"type":"text","text":"The user has asked specifically for the weather in Barcelona."}]},{"role":"system","content":"Now think freely, remember, you are an agent."}]',
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
                    stringValue: 'Think step by step about the user question:',
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
                    stringValue:
                      '[{"type":"text","text":"What is the weather in Barcelona?"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.2.role',
                  value: {
                    stringValue: 'assistant',
                  },
                },
                {
                  key: 'gen_ai.prompt.2.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"The user asked for the weather."}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.3.role',
                  value: {
                    stringValue: 'system',
                  },
                },
                {
                  key: 'gen_ai.prompt.3.content',
                  value: {
                    stringValue: 'Think harder.',
                  },
                },
                {
                  key: 'gen_ai.prompt.4.role',
                  value: {
                    stringValue: 'assistant',
                  },
                },
                {
                  key: 'gen_ai.prompt.4.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"The user has asked specifically for the weather in Barcelona."}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.5.role',
                  value: {
                    stringValue: 'system',
                  },
                },
                {
                  key: 'gen_ai.prompt.5.content',
                  value: {
                    stringValue:
                      'Now think freely, remember, you are an agent.',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.response.messages',
                  value: {
                    stringValue:
                      '[{"role":"assistant","content":[{"type":"text","text":"I need to know the weather in Barcelona. I will use the get_weather tool."}],"tool_calls":[{"id":"fake-tool-call-id-1","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\": \\"Barcelona\\"}"}}]}]',
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
                      '[{"type":"text","text":"I need to know the weather in Barcelona. I will use the get_weather tool."}]',
                  },
                },
                {
                  key: 'gen_ai.completion.0.tool_calls.0.id',
                  value: {
                    stringValue: 'fake-tool-call-id-1',
                  },
                },
                {
                  key: 'gen_ai.completion.0.tool_calls.0.name',
                  value: {
                    stringValue: 'get_weather',
                  },
                },
                {
                  key: 'gen_ai.completion.0.tool_calls.0.arguments',
                  value: {
                    stringValue: '{"location": "Barcelona"}',
                  },
                },
                {
                  key: 'gen_ai.usage.input_tokens',
                  value: {
                    intValue: 57,
                  },
                },
                {
                  key: 'gen_ai.usage.prompt_tokens',
                  value: {
                    intValue: 57,
                  },
                },
                {
                  key: 'gen_ai.usage.cached_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.reasoning_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.completion_tokens',
                  value: {
                    intValue: 19,
                  },
                },
                {
                  key: 'gen_ai.usage.output_tokens',
                  value: {
                    intValue: 19,
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
              name: 'get_weather',
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
                    stringValue: 'get_weather',
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
                    stringValue: 'fake-tool-call-id-1',
                  },
                },
                {
                  key: 'gen_ai.tool.call.arguments',
                  value: {
                    stringValue: '{"location":"Barcelona"}',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.tool.result.value',
                  value: {
                    stringValue: '{"weather":"SUNNY","confidence":0.95}',
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
              name: 'Step',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
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
                      '{"provider":"openai","model":"gpt-4o","type":"agent","temperature":0.5,"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the weather for a given location","parameters":{"location":{"type":"string","description":"The location to get the weather for"}}}}],"max_tokens":1000}',
                  },
                },
                {
                  key: 'gen_ai.request.provider',
                  value: {
                    stringValue: 'openai',
                  },
                },
                {
                  key: 'gen_ai.request.model',
                  value: {
                    stringValue: 'gpt-4o',
                  },
                },
                {
                  key: 'gen_ai.request.type',
                  value: {
                    stringValue: 'agent',
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
                    intValue: 1000,
                  },
                },
                {
                  key: 'gen_ai.request.messages',
                  value: {
                    stringValue:
                      '[{"role":"system","content":"Think step by step about the user question:"},{"role":"user","content":[{"type":"text","text":"What is the weather in Barcelona?"}]},{"role":"assistant","content":[{"type":"text","text":"The user asked for the weather."}]},{"role":"system","content":"Think harder."},{"role":"assistant","content":[{"type":"text","text":"The user has asked specifically for the weather in Barcelona."}]},{"role":"system","content":"Now think freely, remember, you are an agent."},{"role":"assistant","tool_calls":[{"id":"fake-tool-call-id-1","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"Barcelona\\"}"}}],"content":[{"type":"text","text":"I need to know the weather in Barcelona. I will use the get_weather tool."}]},{"toolName":"get_weather","content":[{"type":"text","text":"{\\"weather\\":\\"SUNNY\\",\\"confidence\\":0.95}"}],"role":"tool","isError":false,"tool_call_id":"fake-tool-call-id-1"},{"role":"system","content":"Finally, answer the user question."}]',
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
                    stringValue: 'Think step by step about the user question:',
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
                    stringValue:
                      '[{"type":"text","text":"What is the weather in Barcelona?"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.2.role',
                  value: {
                    stringValue: 'assistant',
                  },
                },
                {
                  key: 'gen_ai.prompt.2.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"The user asked for the weather."}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.3.role',
                  value: {
                    stringValue: 'system',
                  },
                },
                {
                  key: 'gen_ai.prompt.3.content',
                  value: {
                    stringValue: 'Think harder.',
                  },
                },
                {
                  key: 'gen_ai.prompt.4.role',
                  value: {
                    stringValue: 'assistant',
                  },
                },
                {
                  key: 'gen_ai.prompt.4.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"The user has asked specifically for the weather in Barcelona."}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.5.role',
                  value: {
                    stringValue: 'system',
                  },
                },
                {
                  key: 'gen_ai.prompt.5.content',
                  value: {
                    stringValue:
                      'Now think freely, remember, you are an agent.',
                  },
                },
                {
                  key: 'gen_ai.prompt.6.role',
                  value: {
                    stringValue: 'assistant',
                  },
                },
                {
                  key: 'gen_ai.prompt.6.tool_calls.0.id',
                  value: {
                    stringValue: 'fake-tool-call-id-1',
                  },
                },
                {
                  key: 'gen_ai.prompt.6.tool_calls.0.name',
                  value: {
                    stringValue: 'get_weather',
                  },
                },
                {
                  key: 'gen_ai.prompt.6.tool_calls.0.arguments',
                  value: {
                    stringValue: '{"location":"Barcelona"}',
                  },
                },
                {
                  key: 'gen_ai.prompt.6.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"I need to know the weather in Barcelona. I will use the get_weather tool."}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.7.tool_name',
                  value: {
                    stringValue: 'get_weather',
                  },
                },
                {
                  key: 'gen_ai.prompt.7.content',
                  value: {
                    stringValue:
                      '[{"type":"text","text":"{\\"weather\\":\\"SUNNY\\",\\"confidence\\":0.95}"}]',
                  },
                },
                {
                  key: 'gen_ai.prompt.7.role',
                  value: {
                    stringValue: 'tool',
                  },
                },
                {
                  key: 'gen_ai.prompt.7.is_error',
                  value: {
                    boolValue: false,
                  },
                },
                {
                  key: 'gen_ai.prompt.7.tool_call_id',
                  value: {
                    stringValue: 'fake-tool-call-id-1',
                  },
                },
                {
                  key: 'gen_ai.prompt.8.role',
                  value: {
                    stringValue: 'system',
                  },
                },
                {
                  key: 'gen_ai.prompt.8.content',
                  value: {
                    stringValue: 'Finally, answer the user question.',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
                    ),
                  },
                },
                {
                  key: 'gen_ai.response.messages',
                  value: {
                    stringValue:
                      '[{"role":"assistant","content":"The weather in Barcelona is sunny."}]',
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
                    stringValue: 'The weather in Barcelona is sunny.',
                  },
                },
                {
                  key: 'gen_ai.usage.input_tokens',
                  value: {
                    intValue: 93,
                  },
                },
                {
                  key: 'gen_ai.usage.prompt_tokens',
                  value: {
                    intValue: 93,
                  },
                },
                {
                  key: 'gen_ai.usage.cached_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.reasoning_tokens',
                  value: {
                    intValue: 0,
                  },
                },
                {
                  key: 'gen_ai.usage.completion_tokens',
                  value: {
                    intValue: 9,
                  },
                },
                {
                  key: 'gen_ai.usage.output_tokens',
                  value: {
                    intValue: 9,
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
                          stringValue: 'stop',
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
              name: 'Step',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"},{"id":"%ANY%","parentId":"%ANY%","source":"api","type":"step","traceparent":"%ANY%"}]',
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
              name: 'Prompt',
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
                      '---\nprovider: openai\nmodel: gpt-4o\ntype: agent\ntemperature: 0.5\nmaxTokens: 1000\ntools:\n  - get_weather:\n      description: Get the weather for a given location\n      parameters:\n        location:\n          type: string\n          description: The location to get the weather for\n---   \n\n<step>\n  Think step by step about the user question:\n  <user> {{ question }} </user>\n</step>\n\n<step>\n  Think harder.\n</step>\n\n<step>\n  Now think freely, remember, you are an agent.\n</step>\n\n<step>\n  Finally, answer the user question.\n</step>',
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
                      '[{"id":"%ANY%","source":"api","type":"document","data":{"commitUuid":"fake-version-uuid","documentUuid":"fake-document-uuid"},"traceparent":"%ANY%"}]',
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
