import { describe, it, expect } from 'vitest'
import { extractInputOutput } from './extractInputOutput'

describe('extractInputOutput', () => {
  describe('input extraction', () => {
    it('should extract basic text prompts', () => {
      const attrs = {
        'gen_ai.prompt.0.role': 'user',
        'gen_ai.prompt.0.content': 'Hello world',
      }

      const result = extractInputOutput(attrs)
      expect(result.input).toEqual([{ role: 'user', content: 'Hello world' }])
      expect(result.output).toEqual([])
    })

    it('should extract tool results in prompts', () => {
      const attrs = {
        'gen_ai.prompt.0.role': 'tool',
        'gen_ai.prompt.0.content': '{"data": "test"}',
        'gen_ai.prompt.0.tool_name': 'test_tool',
        'gen_ai.prompt.0.tool_call_id': 'call_123',
        'gen_ai.prompt.0.is_error': false,
      }

      const result = extractInputOutput(attrs)
      expect(result.input).toEqual([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_123',
              toolName: 'test_tool',
              result: { data: 'test' },
              isError: false,
            },
          ],
        },
      ])
    })

    it('should handle multiple prompts in order', () => {
      const attrs = {
        'gen_ai.prompt.0.role': 'user',
        'gen_ai.prompt.0.content': 'First message',
        'gen_ai.prompt.1.role': 'assistant',
        'gen_ai.prompt.1.content': 'Second message',
      }

      const result = extractInputOutput(attrs)
      expect(result.input).toEqual([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' },
      ])
    })
  })

  describe('output extraction', () => {
    it('should extract basic text completions', () => {
      const attrs = {
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.content': 'Hello response',
        'gen_ai.completion.0.finish_reason': 'stop',
      }

      const result = extractInputOutput(attrs)
      expect(result.input).toEqual([])
      expect(result.output).toEqual([
        { role: 'assistant', content: 'Hello response' },
      ])
    })

    it('should extract tool calls in completions', () => {
      const attrs = {
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.finish_reason': 'tool_calls',
        'gen_ai.completion.0.tool_calls.0.name': 'test_tool',
        'gen_ai.completion.0.tool_calls.0.id': 'call_123',
        'gen_ai.completion.0.tool_calls.0.arguments': '{"param": "value"}',
      }

      const result = extractInputOutput(attrs)
      expect(result.output).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: 'test_tool',
              args: { param: 'value' },
            },
          ],
        },
      ])
    })
  })

  describe('content extraction', () => {
    it('should handle Anthropic tool calls', () => {
      const attrs = {
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.content': JSON.stringify([
          {
            type: 'tool_use',
            name: 'test_tool',
            id: 'call_123',
            input: { param: 'value' },
          },
        ]),
      }

      const result = extractInputOutput(attrs)
      expect(result.output).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: 'test_tool',
              args: { param: 'value' },
            },
          ],
        },
      ])
    })

    it('should handle Anthropic tool results', () => {
      const attrs = {
        'gen_ai.prompt.0.role': 'assistant',
        'gen_ai.prompt.0.content': JSON.stringify([
          {
            type: 'tool_result',
            tool_use_id: 'call_123',
            content: '{"result": "success"}',
          },
        ]),
      }

      const result = extractInputOutput(attrs)
      expect(result.input).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_123',
              toolName: '-',
              result: { result: 'success' },
              isError: false,
            },
          ],
        },
      ])
    })
  })
})
