import { describe, expect, it } from 'vitest'
import { collectTools } from './collectTools'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { IntegrationType } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ImageIcon } from './types'

const integrations: IntegrationDto[] = [
  {
    id: 1,
    name: 'google',
    type: IntegrationType.ExternalMCP,
    configuration: {},
  },
  {
    id: 2,
    name: 'slack',
    type: IntegrationType.Pipedream,
    configuration: {},
  },
  {
    id: 3,
    name: 'latitude',
    type: IntegrationType.Latitude,
    configuration: {},
  },
] as unknown as IntegrationDto[]

describe('collectTools', () => {
  it('returns empty object if tools is undefined', () => {
    expect(
      collectTools({ integrations, tools: undefined, existingMap: {} }),
    ).toEqual({})
  })

  it('returns empty object if tools is not an array', () => {
    expect(
      collectTools({
        integrations,
        tools: 'google/search' as unknown as LatitudePromptConfig['tools'],
        existingMap: {},
      }),
    ).toEqual({})
  })

  it('returns empty object if tools array is empty', () => {
    expect(collectTools({ integrations, tools: [], existingMap: {} })).toEqual(
      {},
    )
  })

  it('ignores invalid integrations', () => {
    expect(
      collectTools({
        integrations,
        tools: ['unknown/search'],
        existingMap: {},
      }),
    ).toEqual({})
  })

  it('handles integration with no tool (just the name)', () => {
    expect(
      collectTools({
        integrations,
        tools: ['slack'],
        existingMap: {},
      }),
    ).toMatchObject({
      slack: { name: 'slack', tools: [], allToolNames: [] },
    })
  })

  it('handles integration with one specific tool', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/search'],
        existingMap: {},
      }),
    ).toMatchObject({
      google: { name: 'google', tools: ['search'], allToolNames: [] },
    })
  })

  it('accumulates multiple tools for the same integration', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/search', 'google/calendar'],
        existingMap: {},
      }),
    ).toMatchObject({
      google: {
        name: 'google',
        tools: ['search', 'calendar'],
        allToolNames: [],
      },
    })
  })

  it('ignores duplicate tools', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/search', 'google/search', 'google/calendar'],
        existingMap: {},
      }),
    ).toMatchObject({
      google: {
        name: 'google',
        tools: ['search', 'calendar'],
        allToolNames: [],
      },
    })
  })

  it('sets wildcard tool (*) to true', () => {
    expect(
      collectTools({
        integrations,
        tools: ['slack/*'],
        existingMap: {},
      }),
    ).toMatchObject({
      slack: { name: 'slack', tools: true, allToolNames: [] },
    })
  })

  it('wildcard overrides previous specific tools (impossible state)', () => {
    expect(
      collectTools({
        integrations,
        tools: [
          'google/search',
          'google/search',
          'google/calendar',
          'google/*',
        ],
        existingMap: {},
      }),
    ).toMatchObject({
      google: { name: 'google', tools: true, allToolNames: [] },
    })
  })

  it('ignores additional tools after wildcard', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/*', 'google/search', 'google/calendar'],
        existingMap: {},
      }),
    ).toMatchObject({
      google: { name: 'google', tools: true, allToolNames: [] },
    })
  })

  it('handles mixed valid and invalid entries gracefully', () => {
    expect(
      collectTools({
        integrations,
        tools: [
          'google/search',
          'invalid/tool',
          null,
          123,
          '/broken',
          'slack/*',
          undefined,
        ] as unknown as LatitudePromptConfig['tools'],
        existingMap: {},
      }),
    ).toMatchObject({
      google: { name: 'google', tools: ['search'], allToolNames: [] },
      slack: { name: 'slack', tools: true, allToolNames: [] },
    })
  })

  it('returns empty when all entries are invalid', () => {
    expect(
      collectTools({
        integrations,
        tools: [
          123,
          {},
          null,
          '/broken',
          'invalid/tool',
        ] as unknown as LatitudePromptConfig['tools'],
        existingMap: {},
      }),
    ).toEqual({})
  })

  it('handles multiple integrations correctly', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/search', 'slack/*', 'latitude/summarize'],
        existingMap: {},
      }),
    ).toMatchObject({
      google: { name: 'google', tools: ['search'], allToolNames: [] },
      slack: { name: 'slack', tools: true, allToolNames: [] },
      latitude: { name: 'latitude', tools: ['summarize'], allToolNames: [] },
    })
  })

  it('handles integration names but empty tool segments (e.g. "google/")', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/', 'google/search'],
        existingMap: {},
      }),
    ).toMatchObject({
      google: { name: 'google', tools: ['search'], allToolNames: [] },
    })
  })

  describe('with existingMap', () => {
    it('preserves integrations from existing map with empty tools', () => {
      const existingMap = {
        google: {
          id: 1,
          name: 'google',
          type: IntegrationType.ExternalMCP,
          configuration: null,
          icon: { type: 'icon', name: 'mcp' } as ImageIcon,
          tools: ['search', 'calendar'],
          allToolNames: ['search', 'calendar', 'drive'],
          isOpen: false,
        },
      }

      expect(
        collectTools({
          integrations,
          tools: [],
          existingMap,
        }),
      ).toMatchObject({
        google: {
          name: 'google',
          tools: [],
          allToolNames: ['search', 'calendar', 'drive'],
        },
      })
    })

    it('updates existing integrations with new tools', () => {
      const existingMap = {
        google: {
          id: 1,
          name: 'google',
          type: IntegrationType.ExternalMCP,
          configuration: null,
          icon: { type: 'icon', name: 'mcp' } as ImageIcon,
          tools: [],
          allToolNames: ['search', 'calendar'],
          isOpen: false,
        },
      }

      expect(
        collectTools({
          integrations,
          tools: ['google/search'],
          existingMap,
        }),
      ).toMatchObject({
        google: {
          name: 'google',
          tools: ['search'],
          allToolNames: ['search', 'calendar'],
        },
      })
    })

    it('removes integrations that no longer exist in workspace', () => {
      const existingMap = {
        removed: {
          id: 99,
          name: 'removed',
          type: IntegrationType.ExternalMCP,
          configuration: null,
          icon: { type: 'icon', name: 'mcp' } as ImageIcon,
          tools: ['tool1'],
          allToolNames: ['tool1', 'tool2'],
          isOpen: false,
        },
        google: {
          id: 1,
          name: 'google',
          type: IntegrationType.ExternalMCP,
          configuration: null,
          icon: { type: 'icon', name: 'mcp' } as ImageIcon,
          tools: [],
          allToolNames: ['search'],
          isOpen: false,
        },
      }

      const result = collectTools({
        integrations,
        tools: [],
        existingMap,
      })

      expect(result.removed).toBeUndefined()
      expect(result).toMatchObject({
        google: { name: 'google', tools: [], allToolNames: ['search'] },
      })
    })
  })
})
