import { describe, it, expect } from 'vitest'
import { lookupClientTools, isOldToolsSchema } from './clientTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

describe('isOldToolsSchema', () => {
  it('returns true for old schema (object with tool definitions)', () => {
    const tools = {
      myTool: {
        description: 'A tool',
        parameters: {
          type: 'object' as const,
          properties: {},
          additionalProperties: false,
        },
      },
    }
    expect(isOldToolsSchema(tools)).toBe(true)
  })

  it('returns false for new schema (array of tool definitions)', () => {
    const tools = [
      {
        myTool: {
          description: 'A tool',
          parameters: {
            type: 'object' as const,
            properties: {},
            additionalProperties: false,
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as unknown as any
    expect(isOldToolsSchema(tools)).toBe(false)
  })

  it('returns false for null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isOldToolsSchema(null as any)).toBe(false)
  })
})

describe('lookupClientTools', () => {
  describe('when no tools are provided', () => {
    it('returns empty object', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: undefined,
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with old schema (object format)', () => {
    it('lookups client tools correctly', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          myTool: {
            description: 'My custom tool',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        },
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['myTool']
      expect(manifest).toBeDefined()
      expect(manifest!.definition.description).toBe('My custom tool')
      expect(manifest!.sourceData.source).toBe(ToolSource.Client)
    })

    it('filters out provider-specific tools', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          myTool: {
            description: 'My custom tool',
            parameters: {
              type: 'object' as const,
              properties: {},
              additionalProperties: false,
            },
          },
          openai: {
            description: 'Should be filtered out',
            parameters: {
              type: 'object' as const,
              properties: {},
              additionalProperties: false,
            },
          },
        },
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value!['myTool']).toBeDefined()
      expect(result.value!['openai']).toBeUndefined()
    })

    it('converts parameters to jsonSchema format', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          searchTool: {
            description: 'Search tool',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Result limit' },
              },
              required: ['query'],
            },
          },
        },
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['searchTool']
      expect(manifest!.definition.inputSchema).toBeDefined()
    })
  })

  describe('with new schema (array format)', () => {
    it('lookups client tools correctly', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            searchTool: {
              description: 'Search tool',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
              },
            },
          },
          {
            fetchTool: {
              description: 'Fetch tool',
              parameters: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                },
              },
            },
          },
        ],
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value!['searchTool']).toBeDefined()
      expect(result.value!['fetchTool']).toBeDefined()
      expect(result.value!['searchTool']!.definition.description).toBe(
        'Search tool',
      )
    })

    it('filters out string tool ids (latitude/integration tools)', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          'latitude/some-tool',
          'integration/another-tool',
          {
            myClientTool: {
              description: 'Client tool',
              parameters: {
                type: 'object' as const,
                properties: {},
                additionalProperties: false,
              },
            },
          },
        ],
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value!['myClientTool']).toBeDefined()
      expect(Object.keys(result.value!)).toHaveLength(1)
    })

    it('filters out provider-specific tools in new schema', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            myTool: {
              description: 'My tool',
              parameters: {
                type: 'object' as const,
                properties: {},
                additionalProperties: false,
              },
            },
          },
          {
            openai: [
              {
                type: 'web_search' as const,
                search_context_size: 'medium' as const,
              },
            ],
          },
        ],
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value!['myTool']).toBeDefined()
      expect(result.value!['openai']).toBeUndefined()
    })

    it('handles empty array', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [],
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('handles array with only string tool ids', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/tool1', 'integration/tool2'],
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('tool manifest structure', () => {
    it('creates correct manifest structure', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          testTool: {
            description: 'Test description',
            parameters: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        },
      }

      const result = lookupClientTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['testTool']
      expect(manifest).toMatchObject({
        definition: {
          description: 'Test description',
          inputSchema: expect.any(Object),
        },
        sourceData: {
          source: ToolSource.Client,
        },
      })
    })
  })
})
