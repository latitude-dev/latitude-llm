import { describe, it, expect, vi } from 'vitest'
import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { AssistantMessage, MessageRole, ContentType } from 'promptl-ai'
import { TypedResult } from '../../lib/Result'
import {
  getLatitudeToolName,
  getLatitudeToolInternalName,
  getLatitudeToolCallsFromAssistantMessage,
  getLatitudeToolDefinition,
  buildToolMessage,
} from './helpers'
import { LATITUDE_TOOLS } from './tools'

describe('getLatitudeToolName', () => {
  it('converts internal name to tool name correctly', () => {
    expect(getLatitudeToolName(LatitudeToolInternalName.RunCode)).toBe(
      LatitudeTool.RunCode,
    )
    expect(getLatitudeToolName(LatitudeToolInternalName.WebSearch)).toBe(
      LatitudeTool.WebSearch,
    )
    expect(getLatitudeToolName(LatitudeToolInternalName.WebExtract)).toBe(
      LatitudeTool.WebExtract,
    )
    expect(getLatitudeToolName(LatitudeToolInternalName.StoreMemory)).toBe(
      LatitudeTool.StoreMemory,
    )
    expect(getLatitudeToolName(LatitudeToolInternalName.GetMemory)).toBe(
      LatitudeTool.GetMemory,
    )
  })
})

describe('getLatitudeToolInternalName', () => {
  it('converts tool name to internal name correctly', () => {
    expect(getLatitudeToolInternalName(LatitudeTool.RunCode)).toBe(
      LatitudeToolInternalName.RunCode,
    )
    expect(getLatitudeToolInternalName(LatitudeTool.WebSearch)).toBe(
      LatitudeToolInternalName.WebSearch,
    )
    expect(getLatitudeToolInternalName(LatitudeTool.WebExtract)).toBe(
      LatitudeToolInternalName.WebExtract,
    )
    expect(getLatitudeToolInternalName(LatitudeTool.StoreMemory)).toBe(
      LatitudeToolInternalName.StoreMemory,
    )
    expect(getLatitudeToolInternalName(LatitudeTool.GetMemory)).toBe(
      LatitudeToolInternalName.GetMemory,
    )
  })
})

describe('getLatitudeToolCallsFromAssistantMessage', () => {
  it('returns empty array when no tool calls', () => {
    const message: AssistantMessage = {
      role: MessageRole.assistant,
      content: [{ type: ContentType.text, text: 'Hello world' }],
    }

    const result = getLatitudeToolCallsFromAssistantMessage(message)
    expect(result).toEqual([])
  })

  it('filters out non-latitude tool calls', () => {
    const message: AssistantMessage = {
      role: MessageRole.assistant,
      content: [{ type: ContentType.text, text: 'Using tools' }],
      toolCalls: {
        call1: {
          id: 'call1',
          name: 'some_other_tool',
          arguments: {},
        },
        call2: {
          id: 'call2',
          name: LatitudeToolInternalName.WebSearch,
          arguments: { query: 'test' },
        },
      },
    }

    const result = getLatitudeToolCallsFromAssistantMessage(message)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe(LatitudeToolInternalName.WebSearch)
  })

  it('returns all latitude tool calls', () => {
    const message: AssistantMessage = {
      role: MessageRole.assistant,
      content: [{ type: ContentType.text, text: 'Using multiple tools' }],
      toolCalls: {
        call1: {
          id: 'call1',
          name: LatitudeToolInternalName.WebSearch,
          arguments: { query: 'test' },
        },
        call2: {
          id: 'call2',
          name: LatitudeToolInternalName.RunCode,
          arguments: { code: 'console.log("test")' },
        },
      },
    }

    const result = getLatitudeToolCallsFromAssistantMessage(message)
    expect(result).toHaveLength(2)
    expect(result.map((call) => call.name)).toEqual([
      LatitudeToolInternalName.WebSearch,
      LatitudeToolInternalName.RunCode,
    ])
  })
})

describe('getLatitudeToolDefinition', () => {
  it('returns undefined for non-existent tool', () => {
    const result = getLatitudeToolDefinition({
      tool: 'non-existent' as LatitudeTool,
    })
    expect(result).toBeUndefined()
  })

  it('returns tool definition for valid tool', () => {
    const result = getLatitudeToolDefinition({
      tool: LatitudeTool.WebSearch,
    })
    expect(result).toBeDefined()
    expect(result).toHaveProperty('description')
    expect(result).toHaveProperty('parameters')
  })

  it('passes context, config, and document to definition function', () => {
    // Mock the definition function to capture arguments
    const mockDefinition = vi.fn().mockReturnValue({ description: 'test' })

    // Mock LATITUDE_TOOLS to return our mock tool
    vi.mocked(LATITUDE_TOOLS).find = vi.fn().mockReturnValue({
      name: LatitudeTool.WebSearch,
      hidden: false,
      definition: mockDefinition,
    })

    getLatitudeToolDefinition({
      tool: LatitudeTool.WebSearch,
      context: {} as any,
      config: {} as any,
      document: {} as any,
    })

    expect(mockDefinition).toHaveBeenCalledWith({
      context: {} as any,
      config: {} as any,
      document: {} as any,
    })
  })

  it('respects hidden parameter', () => {
    // Test with hidden=true (default)
    const resultHidden = getLatitudeToolDefinition({
      tool: LatitudeTool.WebSearch,
      hidden: true,
    })
    expect(resultHidden).toBeDefined()

    // Test with hidden=false - should still return if tool is not hidden
    const resultNotHidden = getLatitudeToolDefinition({
      tool: LatitudeTool.WebSearch,
      hidden: false,
    })
    expect(resultNotHidden).toBeDefined()
  })
})

describe('buildToolMessage', () => {
  it('builds tool message for successful result', () => {
    const result: TypedResult<string, Error> = {
      ok: true,
      value: 'success result',
      error: undefined,
      unwrap: vi.fn().mockReturnValue('success result'),
      bind: vi.fn(),
    }

    const message = buildToolMessage({
      toolName: 'test-tool',
      toolId: 'test-id',
      result,
    })

    expect(message).toEqual({
      role: MessageRole.tool,
      content: [
        {
          type: 'tool-result',
          toolName: 'test-tool',
          toolCallId: 'test-id',
          result: 'success result',
          isError: false,
        },
      ],
    })
  })

  it('builds tool message for error result', () => {
    const error = new Error('test error')
    const result: TypedResult<string, Error> = {
      ok: false,
      value: undefined,
      error,
      unwrap: vi.fn().mockImplementation(() => {
        throw error
      }) as any,
      bind: vi.fn(),
    }

    const message = buildToolMessage({
      toolName: 'test-tool',
      toolId: 'test-id',
      result,
    })

    expect(message).toEqual({
      role: MessageRole.tool,
      content: [
        {
          type: 'tool-result',
          toolName: 'test-tool',
          toolCallId: 'test-id',
          result: 'test error',
          isError: true,
        },
      ],
    })
  })

  it('handles null/undefined result values', () => {
    const result: TypedResult<unknown, Error> = {
      ok: true,
      value: null,
      error: undefined,
      unwrap: vi.fn().mockReturnValue(null),
      bind: vi.fn(),
    }

    const message = buildToolMessage({
      toolName: 'test-tool',
      toolId: 'test-id',
      result,
    })

    expect(message.content[0].result).toBeUndefined()
    expect(message.content[0].isError).toBe(false)
  })
})
