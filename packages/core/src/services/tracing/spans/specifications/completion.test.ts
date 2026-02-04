import { ATTRIBUTES } from '@latitude-data/constants'
import { describe, expect, it } from 'vitest'
import { extractInput, extractOutput } from './completion'

describe('extractInput', () => {
  describe('Latitude format (nested)', () => {
    it('extracts user messages', () => {
      const attributes = {
        [ATTRIBUTES.LATITUDE.request.messages]: JSON.stringify([
          { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
      ])
    })

    it('extracts assistant messages with tool calls', () => {
      const attributes = {
        [ATTRIBUTES.LATITUDE.request.messages]: JSON.stringify([
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me search for that' },
              {
                type: 'tool-call',
                toolCallId: 'tc-1',
                toolName: 'search',
                args: { query: 'weather' },
              },
            ],
            toolCalls: null,
          },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })

    it('extracts tool result messages', () => {
      const attributes = {
        [ATTRIBUTES.LATITUDE.request.messages]: JSON.stringify([
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'tc-1',
                toolName: 'search',
                result: { data: 'Sunny, 25°C' },
                isError: false,
              },
            ],
          },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('tool')
    })
  })

  describe('Vercel AI SDK format (nested)', () => {
    it('extracts user messages with string content', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.prompt.messages]: JSON.stringify([
          { role: 'user', content: 'Hello!' },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('user')
    })

    it('extracts system messages', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.prompt.messages]: JSON.stringify([
          { role: 'system', content: 'Be helpful' },
          { role: 'user', content: 'Hi' },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(2)
      expect(result.value![0].role).toBe('system')
      expect(result.value![1].role).toBe('user')
    })

    it('extracts messages with image content', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.prompt.messages]: JSON.stringify([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              { type: 'image', image: 'data:image/png;base64,xxx' },
            ],
          },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('user')
    })

    it('extracts tool call messages', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.prompt.messages]: JSON.stringify([
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'calculator',
                input: { expression: '2+2' },
              },
            ],
          },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })
  })

  describe('OpenTelemetry deprecated format (flattened)', () => {
    it('extracts flattened prompt messages', () => {
      const attributes = {
        'gen_ai.prompt.0.role': 'user',
        'gen_ai.prompt.0.content': 'Hello there',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('user')
    })

    it('extracts multiple flattened messages', () => {
      const attributes = {
        'gen_ai.prompt.0.role': 'system',
        'gen_ai.prompt.0.content': 'Be helpful',
        'gen_ai.prompt.1.role': 'user',
        'gen_ai.prompt.1.content': 'Hi',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(2)
      expect(result.value![0].role).toBe('system')
      expect(result.value![1].role).toBe('user')
    })

    it('extracts flattened messages with tool calls', () => {
      const attributes = {
        'gen_ai.prompt.0.role': 'assistant',
        'gen_ai.prompt.0.content': 'Using a tool',
        'gen_ai.prompt.0.tool_calls.0.id': 'tc-1',
        'gen_ai.prompt.0.tool_calls.0.name': 'search',
        'gen_ai.prompt.0.tool_calls.0.arguments': '{"q":"test"}',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })
  })

  describe('OpenInference format (flattened)', () => {
    it('extracts input messages from llm.input_messages', () => {
      const attributes = {
        'llm.input_messages.0.message.role': 'user',
        'llm.input_messages.0.message.content': 'Hello from OpenInference',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('user')
    })

    it('extracts input messages from llm.prompts', () => {
      const attributes = {
        'llm.prompts.0.message.role': 'user',
        'llm.prompts.0.message.content': 'Hello from prompts',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('user')
    })

    it('unwraps nested message structure', () => {
      const attributes = {
        'llm.input_messages.0.message.role': 'user',
        'llm.input_messages.0.message.content': 'Nested message content',
        'llm.input_messages.1.message.role': 'assistant',
        'llm.input_messages.1.message.content': 'Reply content',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(2)
      expect(result.value![0].role).toBe('user')
      expect(result.value![1].role).toBe('assistant')
    })
  })

  describe('priority and fallback', () => {
    it('returns empty array when no messages found', () => {
      const attributes = {}

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toEqual([])
    })

    it('skips empty message arrays and tries next format', () => {
      const attributes = {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.input.messages]: JSON.stringify([]),
        [ATTRIBUTES.LATITUDE.request.messages]: JSON.stringify([
          { role: 'user', content: [{ type: 'text', text: 'Latitude msg' }] },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      const content = result.value![0].content as Array<{ text: string }>
      expect(content[0].text).toBe('Latitude msg')
    })
  })

  describe('error handling', () => {
    it('returns error for invalid JSON in nested messages', () => {
      const attributes = {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.input.messages]: 'not valid json',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeDefined()
      expect(result.error!.message).toContain('Invalid nested messages')
    })

    it('returns error for non-array nested messages', () => {
      const attributes = {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.input.messages]: JSON.stringify({
          role: 'user',
          content: 'Not an array',
        }),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeDefined()
      expect(result.error!.message).toContain('Invalid nested messages')
    })

    it('returns error for invalid system instructions JSON', () => {
      const attributes = {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.systemInstructions]: 'not valid json',
      }

      const result = extractInput(attributes)

      expect(result.error).toBeDefined()
      expect(result.error!.message).toContain('Invalid system instructions')
    })
  })
})

describe('extractOutput', () => {
  describe('Latitude format (nested)', () => {
    it('extracts assistant response', () => {
      const attributes = {
        [ATTRIBUTES.LATITUDE.response.messages]: JSON.stringify([
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from Latitude' }],
            toolCalls: null,
          },
        ]),
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })

    it('extracts response with reasoning content', () => {
      const attributes = {
        [ATTRIBUTES.LATITUDE.response.messages]: JSON.stringify([
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'Let me think about this...' },
              { type: 'text', text: 'The answer is 42' },
            ],
            toolCalls: null,
          },
        ]),
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      const content = result.value![0].content as Array<{ type: string }>
      expect(content.some((c) => c.type === 'reasoning')).toBe(true)
      expect(content.some((c) => c.type === 'text')).toBe(true)
    })

    it('extracts response with tool-call content', () => {
      const attributes = {
        [ATTRIBUTES.LATITUDE.response.messages]: JSON.stringify([
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'tc-1',
                toolName: 'weather',
                args: { city: 'London' },
              },
            ],
            toolCalls: null,
          },
        ]),
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })
  })

  describe('OpenTelemetry deprecated format (flattened)', () => {
    it('extracts flattened completion messages', () => {
      const attributes = {
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.content': 'Response text',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })

    it('extracts multiple flattened completion messages', () => {
      const attributes = {
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.content': 'First response',
        'gen_ai.completion.1.role': 'assistant',
        'gen_ai.completion.1.content': 'Second response',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(2)
    })

    it('extracts flattened completion with tool calls', () => {
      const attributes = {
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.content': 'Using tools',
        'gen_ai.completion.0.tool_calls.0.id': 'call-1',
        'gen_ai.completion.0.tool_calls.0.name': 'search',
        'gen_ai.completion.0.tool_calls.0.arguments': '{"q":"test"}',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
    })
  })

  describe('OpenInference format (flattened)', () => {
    it('extracts output messages from llm.output_messages', () => {
      const attributes = {
        'llm.output_messages.0.message.role': 'assistant',
        'llm.output_messages.0.message.content': 'OpenInference response',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })

    it('extracts output messages from llm.completions', () => {
      const attributes = {
        'llm.completions.0.message.role': 'assistant',
        'llm.completions.0.message.content': 'Completions response',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })

    it('unwraps nested message structure', () => {
      const attributes = {
        'llm.output_messages.0.message.role': 'assistant',
        'llm.output_messages.0.message.content': 'Nested output content',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })
  })

  describe('Vercel AI SDK response format', () => {
    it('extracts text response', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.text]: 'Hello from AI SDK',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
      const content = result.value![0].content as Array<{
        type: string
        text: string
      }>
      expect(content.some((c) => c.type === 'text')).toBe(true)
    })

    it('extracts object response', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.object]: '{"name":"John","age":30}',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })

    it('extracts tool calls response', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.toolCalls]: JSON.stringify([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'get_data',
            input: { id: 123 },
          },
        ]),
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
    })

    it('combines text and tool calls in response', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.text]: 'Let me get that data',
        [ATTRIBUTES.AI_SDK.response.toolCalls]: JSON.stringify([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'fetch',
            input: {},
          },
        ]),
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
      expect(result.value![0].role).toBe('assistant')
      const content = result.value![0].content as Array<{ type: string }>
      expect(content.length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty when only empty response parts', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.text]: '',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toEqual([])
    })
  })

  describe('priority and fallback', () => {
    it('returns empty array when no output messages found', () => {
      const attributes = {}

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toEqual([])
    })

    it('falls back to AI SDK response format when no messages', () => {
      const attributes = {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.output.messages]: JSON.stringify([]),
        [ATTRIBUTES.AI_SDK.response.text]: 'Fallback text',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
    })
  })

  describe('error handling', () => {
    it('returns error for invalid JSON in nested messages', () => {
      const attributes = {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.output.messages]: 'not valid json',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeDefined()
      expect(result.error!.message).toContain('Invalid nested messages')
    })

    it('returns error for non-array nested messages', () => {
      const attributes = {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.output.messages]: JSON.stringify({
          role: 'assistant',
          content: 'Not an array',
        }),
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeDefined()
      expect(result.error!.message).toContain('Invalid nested messages')
    })

    it('returns error for invalid tool calls JSON', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.toolCalls]: 'not valid json',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeDefined()
      expect(result.error!.message).toContain('Invalid output tool calls')
    })

    it('returns error for non-array tool calls', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.toolCalls]: JSON.stringify({
          id: 'call-1',
          name: 'test',
        }),
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeDefined()
      expect(result.error!.message).toContain('Invalid output tool calls')
    })
  })
})

describe('translation to Promptl format', () => {
  describe('input messages', () => {
    it('translates VercelAI string content to Promptl format', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.prompt.messages]: JSON.stringify([
          { role: 'user', content: 'Simple string message' },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value![0].role).toBe('user')
    })

    it('handles file content translation', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.prompt.messages]: JSON.stringify([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'base64data',
                mediaType: 'application/pdf',
              },
            ],
          },
        ]),
      }

      const result = extractInput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value).toHaveLength(1)
    })
  })

  describe('output messages', () => {
    it('translates AI SDK response to Promptl format', () => {
      const attributes = {
        [ATTRIBUTES.AI_SDK.response.text]: 'Simple response',
      }

      const result = extractOutput(attributes)

      expect(result.error).toBeUndefined()
      expect(result.value![0].role).toBe('assistant')
      const content = result.value![0].content as Array<{
        type: string
        text: string
      }>
      expect(content.some((c) => c.type === 'text')).toBe(true)
    })
  })
})
