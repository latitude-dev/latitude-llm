import { VercelTools } from '@latitude-data/constants'
import { jsonSchema } from 'ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildTools } from './index'

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
      web_search_preview: {
        type: 'provider-defined',
        id: 'openai.web_search_preview',
        args: {
          searchContextSize: 'low',
        },
        parameters: z.object({}),
      },
    } satisfies VercelTools

    const result = buildTools(tools)
    expect(result.value).toEqual({
      get_weather: {
        description:
          'Obtains the weather temperature from a given location id.',
        parameters: jsonSchema({
          type: 'object',
          additionalProperties: false,
          required: ['location_id'],
          properties: {
            location_id: {
              type: 'number',
              description: 'The id for the location.',
            },
          },
        }),
      },
      web_search_preview: {
        type: 'provider-defined',
        id: 'openai.web_search_preview',
        args: {
          searchContextSize: 'low',
        },
        parameters: expect.anything(),
      },
    })
  })

  it('returns undefined when tools are not provided', () => {
    const tools = undefined

    const result = buildTools(tools)
    expect(result.value).toBeUndefined()
  })
})
