import { describe, it, expect } from 'vitest'
import { buildTools } from './index'
import { VercelTools } from '@latitude-data/constants'
import { jsonSchema } from 'ai'

describe('buildTools', () => {
  it('builds and validate tools', () => {
    const tools = {
      get_weather: {
        description:
          'Obtains the weather temperature from a given location id.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['location_id'],
          properties: {
            location_id: {
              type: 'number',
              description: 'The id for the location.',
            },
          },
        },
      },
      web_search: {
        type: 'provider-defined',
        id: 'openai.web_search',
        name: 'web_search',
        args: {
          searchContextSize: 'low',
        },
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        }),
      },
    } satisfies VercelTools

    const result = buildTools(tools)
    expect(result.value).toMatchObject({
      get_weather: {
        description:
          'Obtains the weather temperature from a given location id.',
        inputSchema: {
          jsonSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['location_id'],
            properties: {
              location_id: {
                type: 'number',
                description: 'The id for the location.',
              },
            },
          },
        },
      },
      web_search: {
        type: 'provider-defined',
        id: 'openai.web_search',
        name: 'web_search', // AI SDK v5 requires name property
        args: {
          searchContextSize: 'low',
        },
        inputSchema: expect.anything(),
      },
    })
  })

  it('returns undefined when tools are not provided', () => {
    const tools = undefined

    const result = buildTools(tools)
    expect(result.value).toBeUndefined()
  })
})
