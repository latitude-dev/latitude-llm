import { describe, it, expect } from 'vitest'
import { collectCustomTools } from './collectCustomTools'

describe('collectCustomTools', () => {
  it('returns empty result when tools is undefined', () => {
    const result = collectCustomTools(undefined)
    expect(result).toEqual({ toolNames: [], metadata: {} })
  })

  it('returns empty result when tools is not an array', () => {
    const result = collectCustomTools({} as any)
    expect(result).toEqual({ toolNames: [], metadata: {} })
  })

  it('returns empty result when tools only contains strings', () => {
    const tools = ['latitude/search', 'latitude/extract', 'myintegration/*']
    const result = collectCustomTools(tools)
    expect(result).toEqual({ toolNames: [], metadata: {} })
  })

  it('extracts custom tool names and metadata from objects', () => {
    const tools = [
      'latitude/search',
      {
        get_weather: {
          description: 'Get the current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'The location' },
            },
          },
        },
      },
      'latitude/extract',
    ]
    const result = collectCustomTools(tools)
    expect(result).toEqual({
      toolNames: ['get_weather'],
      metadata: {
        get_weather: {
          description: 'Get the current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'The location' },
            },
          },
        },
      },
    })
  })

  it('extracts multiple custom tool names', () => {
    const tools = [
      {
        get_weather: {
          description: 'Get the current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      },
      'latitude/search',
      {
        calculate_sum: {
          description: 'Calculate the sum of two numbers',
          parameters: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
          },
        },
      },
      {
        send_email: {
          description: 'Send an email',
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              subject: { type: 'string' },
            },
          },
        },
      },
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual([
      'get_weather',
      'calculate_sum',
      'send_email',
    ])
    expect(result.metadata.get_weather).toBeDefined()
    expect(result.metadata.calculate_sum).toBeDefined()
    expect(result.metadata.send_email).toBeDefined()
  })

  it('handles empty objects gracefully', () => {
    const tools = [{}, 'latitude/search', {}]
    const result = collectCustomTools(tools)
    expect(result).toEqual({ toolNames: [], metadata: {} })
  })

  it('only extracts the first key from each object', () => {
    const tools = [
      {
        tool1: {
          description: 'Tool 1',
          parameters: { type: 'object', properties: {} },
        },
        tool2: { description: 'Tool 2' }, // This should be ignored
      },
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual(['tool1'])
  })

  it('filters out null values', () => {
    const tools = [
      {
        valid_tool: {
          description: 'Valid',
          parameters: { type: 'object', properties: {} },
        },
      },
      {},
      {
        another_tool: {
          description: 'Another',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual(['valid_tool', 'another_tool'])
  })

  it('handles mixed array with strings, objects, and other types', () => {
    const tools: any = [
      'latitude/search',
      {
        custom_tool: {
          description: 'Custom',
          parameters: { type: 'object', properties: {} },
        },
      },
      null,
      undefined,
      'myintegration/tool',
      {
        another_custom: {
          description: 'Another',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual(['custom_tool', 'another_custom'])
  })

  it('with provider tools: extracts provider name (e.g., openai with web_search_preview)', () => {
    const tools = [
      'latitude/search',
      {
        openai: [
          {
            type: 'web_search_preview',
            search_context_size: 'low',
          },
        ],
      },
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual(['openai'])
    // Provider tools don't have parameters attribute, so no metadata
    expect(result.metadata).toEqual({})
  })

  it('with provider tools: extracts multiple provider names', () => {
    const tools = [
      'latitude/search',
      {
        openai: [
          {
            type: 'web_search_preview',
            search_context_size: 'low',
          },
        ],
      },
      {
        anthropic: [
          {
            type: 'computer_use_20241022',
            display_height_px: 768,
            display_width_px: 1024,
          },
        ],
      },
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual(['openai', 'anthropic'])
  })

  it('with provider tools: handles mix of custom tools and provider tools', () => {
    const tools = [
      'latitude/search',
      {
        get_weather: {
          description: 'Get the current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      },
      {
        openai: [
          {
            type: 'web_search_preview',
            search_context_size: 'low',
          },
        ],
      },
      'myintegration/tool',
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual(['get_weather', 'openai'])
    // Only get_weather has parameters
    expect(result.metadata.get_weather).toBeDefined()
    expect(result.metadata.openai).toBeUndefined()
  })

  it('handles complex JSON schema with nested properties', () => {
    const tools = [
      {
        complex_tool: {
          description: 'A tool with complex nested schema',
          parameters: {
            type: 'object',
            properties: {
              simple_param: {
                type: 'string',
                description: 'A simple string parameter',
              },
              nested_object: {
                type: 'object',
                description: 'An object with nested properties',
                properties: {
                  nested_field: {
                    type: 'string',
                    description: 'This is nested and should be captured',
                  },
                },
              },
              array_param: {
                type: 'array',
                description: 'An array parameter',
                items: {
                  type: 'string',
                },
              },
            },
            required: ['simple_param', 'nested_object'],
          },
        },
      },
    ]
    const result = collectCustomTools(tools)
    expect(result.toolNames).toEqual(['complex_tool'])
    expect(result.metadata.complex_tool).toBeDefined()
    expect(result.metadata.complex_tool?.description).toBe(
      'A tool with complex nested schema',
    )
    expect(result.metadata.complex_tool?.parameters?.properties).toBeDefined()
    // Verify all properties are captured (including nested ones)
    expect(
      result.metadata.complex_tool?.parameters?.properties?.simple_param,
    ).toBeDefined()
    expect(
      result.metadata.complex_tool?.parameters?.properties?.nested_object,
    ).toBeDefined()
    expect(
      result.metadata.complex_tool?.parameters?.properties?.array_param,
    ).toBeDefined()
    expect(result.metadata.complex_tool?.parameters?.required).toEqual([
      'simple_param',
      'nested_object',
    ])
  })
})
