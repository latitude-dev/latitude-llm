import { describe, it, expect } from 'vitest'
import { lookupLatitudeTools } from './latitudeTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { LatitudeTool } from '@latitude-data/constants'

describe('lookupLatitudeTools', () => {
  describe('when no tools are provided', () => {
    it('returns empty object', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: undefined,
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with old schema (object format)', () => {
    it('returns empty object (no latitude tools in old schema)', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          myTool: {
            description: 'Custom tool',
            parameters: {} as any,
          },
        },
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with new schema (array format)', () => {
    it('returns empty object when no latitude tools specified', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          {
            myTool: {
              description: 'Custom tool',
              parameters: {} as any,
            },
          },
          'my-integration/search',
        ],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('lookups single latitude tool', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/search'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      const tools = Object.keys(result.value!)
      expect(tools.length).toBe(1)
      const toolManifest = Object.values(result.value!)[0]
      expect(toolManifest!.sourceData.source).toBe(ToolSource.Latitude)
      expect(toolManifest!.sourceData.latitudeTool).toBe(LatitudeTool.WebSearch)
    })

    it('lookups multiple latitude tools', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/search', 'latitude/code'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(2)
    })

    it('lookups all latitude tools with wildcard', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/*'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      const tools = Object.values(result.value!)
      expect(tools.length).toBeGreaterThan(0)
      tools.forEach((tool) => {
        expect(tool.sourceData.source).toBe(ToolSource.Latitude)
        expect(tool.sourceData.latitudeTool).toBeDefined()
      })
    })

    it('combines specific tools with wildcard', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/search', 'latitude/*'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      // Should include all tools (wildcard takes precedence)
      expect(Object.keys(result.value!).length).toBeGreaterThan(1)
    })

    it('filters out non-latitude string tool ids', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/search', 'integration/some-tool', 'other/tool'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      const tools = Object.keys(result.value!)
      expect(tools.length).toBe(1)
    })

    it('returns error when latitude tool name is empty', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "You must specify a tool name after 'latitude/'",
      )
    })

    it('returns error when latitude tool name is not found', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/non-existent-tool'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "There is no Latitude tool with the name 'non-existent-tool'",
      )
    })

    it('handles mixed array with client tools and latitude tools', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          'latitude/search',
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

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      // Should only include latitude tools
      expect(Object.keys(result.value!).length).toBe(1)
    })
  })

  describe('tool manifest structure', () => {
    it('creates correct manifest structure with all required fields', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/search'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      const manifest = Object.values(result.value!)[0]
      expect(manifest).toMatchObject({
        definition: {
          description: expect.any(String),
          inputSchema: expect.any(Object),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: expect.any(String),
        },
      })
    })

    it('includes outputSchema when defined', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/search'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      const manifest = Object.values(result.value!)[0]
      expect(manifest!.definition).toHaveProperty('inputSchema')
      expect(manifest!.definition).toHaveProperty('outputSchema')
    })

    it('handles empty tools array', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('handles tools array with only non-latitude strings', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['integration/tool1', 'other/tool2'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('handles latitude/ with trailing slashes', () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/'],
      }

      const result = lookupLatitudeTools({ config })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "You must specify a tool name after 'latitude/'",
      )
    })
  })
})
