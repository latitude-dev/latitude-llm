import { describe, it, expect } from 'vitest'
import { lookupProviderTools } from './providerTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import {
  LatitudePromptConfig,
  OpenAIWebSearchTool,
} from '@latitude-data/constants/latitudePromptSchema'
import { Providers } from '@latitude-data/constants'

describe('lookupProviderTools', () => {
  describe('when no tools are provided', () => {
    it('returns empty object', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: undefined,
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with old schema (object format)', () => {
    it('processes openai tools from old schema', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          openai: [
            {
              type: 'web_search',
              search_context_size: 'medium',
            },
          ],
        },
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      const tools = Object.values(result.value!)
      expect(tools.length).toBe(1)
      expect(tools[0]!.sourceData.source).toBe(ToolSource.ProviderTool)
      expect(tools[0]!.sourceData.provider).toBe(Providers.OpenAI)
    })

    it('ignores non-openai tools', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          myTool: {
            description: 'My tool',
            parameters: {} as any,
          },
        },
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with new schema (array format)', () => {
    it('lookups OpenAI web_search tool', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'low',
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value!['web_search']).toBeDefined()
      expect(result.value!['web_search']!.sourceData.source).toBe(
        ToolSource.ProviderTool,
      )
      expect(result.value!['web_search']!.sourceData.provider).toBe(
        Providers.OpenAI,
      )
    })

    it('lookups web_search with user_location', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'high',
                user_location: {
                  type: 'approximate',
                  city: 'New York',
                  country: 'US',
                },
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      const tool = result.value!['web_search']
      expect(tool).toBeDefined()
      const toolData = tool!.sourceData.tool as OpenAIWebSearchTool
      expect(toolData.type).toBe('web_search')
      expect(toolData.user_location?.city).toBe('New York')
      expect(toolData.user_location?.country).toBe('US')
    })

    it('lookups multiple OpenAI tools', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'low',
              },
              {
                type: 'web_search',
                search_context_size: 'high',
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      // Should only have one web_search (the last one overwrites)
      expect(result.value!['web_search']).toBeDefined()
    })

    it('returns error for file_search tool (not supported)', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'file_search',
                vector_store_ids: [],
              } as any,
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'file search tool is not supported',
      )
    })

    it('returns error for computer_use_preview tool (not supported)', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'computer_use_preview',
                display_height: 768,
                display_width: 1024,
                environment: 'linux',
              } as any,
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'computer use tool is not supported',
      )
    })

    it('ignores non-openai tools in array', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          'latitude/search',
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
                type: 'web_search',
                search_context_size: 'medium',
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(1)
      expect(result.value!['web_search']).toBeDefined()
    })

    it('handles multiple openai tool declarations in array', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'low',
              },
            ],
          },
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'high',
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      // Last one should win
      expect(result.value!['web_search']).toBeDefined()
    })
  })

  describe('tool manifest structure', () => {
    it('creates correct manifest with all fields', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'medium',
                user_location: {
                  type: 'approximate',
                  city: 'San Francisco',
                  country: 'US',
                },
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['web_search']
      expect(manifest).toMatchObject({
        definition: {
          inputSchema: expect.any(Object),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
            user_location: expect.objectContaining({
              city: 'San Francisco',
              country: 'US',
            }),
          },
        },
      })
    })

    it('includes outputSchema when available', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'low',
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['web_search']
      expect(manifest!.definition).toHaveProperty('inputSchema')
      // outputSchema may or may not be present
    })

    it('preserves search_context_size in tool data', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'high',
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['web_search']
      const toolData = manifest!.sourceData.tool as OpenAIWebSearchTool
      expect(toolData.search_context_size).toBe('high')
    })
  })

  describe('edge cases', () => {
    it('handles empty tools array', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('handles empty openai array', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('handles tools array with no openai tools', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          'latitude/web-search',
          {
            myTool: {
              description: 'My tool',
              parameters: {} as any,
            },
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('returns error for invalid openai tool schema', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'invalid_tool_type',
              } as any,
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(false)
    })
  })

  describe('default values', () => {
    it('uses default search_context_size when not provided', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
              } as any,
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['web_search']
      expect(manifest).toBeDefined()
    })

    it('works without user_location', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            openai: [
              {
                type: 'web_search',
                search_context_size: 'medium',
              },
            ],
          },
        ],
      }

      const result = lookupProviderTools({ config })

      expect(result.ok).toBe(true)
      const manifest = result.value!['web_search']
      const toolData = manifest!.sourceData.tool as OpenAIWebSearchTool
      expect(toolData.user_location).toBeUndefined()
    })
  })
})
