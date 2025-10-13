import { describe, it, expect } from 'vitest'
import { collectCustomTools } from './collectCustomTools'

describe('collectCustomTools', () => {
  it('returns empty array when tools is undefined', () => {
    const result = collectCustomTools(undefined)
    expect(result).toEqual([])
  })

  it('returns empty array when tools is not an array', () => {
    const result = collectCustomTools({} as any)
    expect(result).toEqual([])
  })

  it('returns empty array when tools only contains strings', () => {
    const tools = ['latitude/search', 'latitude/extract', 'myintegration/*']
    const result = collectCustomTools(tools)
    expect(result).toEqual([])
  })

  it('extracts custom tool names from objects', () => {
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
      'latitude/extract',
    ]
    const result = collectCustomTools(tools)
    expect(result).toEqual(['get_weather'])
  })

  it('extracts multiple custom tool names', () => {
    const tools = [
      {
        get_weather: {
          description: 'Get the current weather',
        },
      },
      'latitude/search',
      {
        calculate_sum: {
          description: 'Calculate the sum of two numbers',
        },
      },
      {
        send_email: {
          description: 'Send an email',
        },
      },
    ]
    const result = collectCustomTools(tools)
    expect(result).toEqual(['get_weather', 'calculate_sum', 'send_email'])
  })

  it('handles empty objects gracefully', () => {
    const tools = [{}, 'latitude/search', {}]
    const result = collectCustomTools(tools)
    expect(result).toEqual([])
  })

  it('only extracts the first key from each object', () => {
    const tools = [
      {
        tool1: { description: 'Tool 1' },
        tool2: { description: 'Tool 2' }, // This should be ignored
      },
    ]
    const result = collectCustomTools(tools)
    expect(result).toEqual(['tool1'])
  })

  it('filters out null values', () => {
    const tools = [
      {
        valid_tool: { description: 'Valid' },
      },
      {},
      {
        another_tool: { description: 'Another' },
      },
    ]
    const result = collectCustomTools(tools)
    expect(result).toEqual(['valid_tool', 'another_tool'])
  })

  it('handles mixed array with strings, objects, and other types', () => {
    const tools: any = [
      'latitude/search',
      {
        custom_tool: { description: 'Custom' },
      },
      null,
      undefined,
      'myintegration/tool',
      {
        another_custom: { description: 'Another' },
      },
    ]
    const result = collectCustomTools(tools)
    expect(result).toEqual(['custom_tool', 'another_custom'])
  })
})
