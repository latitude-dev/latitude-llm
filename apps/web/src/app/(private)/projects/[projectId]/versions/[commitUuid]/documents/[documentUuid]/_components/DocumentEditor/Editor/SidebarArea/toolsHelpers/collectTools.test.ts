import { describe, expect, it } from 'vitest'
import { collectTools } from './collectTools'
import { IntegrationDto } from '@latitude-data/core/schema/types'

const integrations: IntegrationDto[] = [
  { name: 'google' } as IntegrationDto,
  { name: 'slack' } as IntegrationDto,
]

describe('collectTools', () => {
  it('returns empty object if tools is undefined', () => {
    expect(collectTools({ integrations, tools: undefined })).toEqual({})
  })

  it('returns empty object if tools is not an array', () => {
    expect(collectTools({ integrations, tools: 'google/search' })).toEqual({})
  })

  it('returns empty object if tools array is empty', () => {
    expect(collectTools({ integrations, tools: [] })).toEqual({})
  })

  it('ignores invalid integrations', () => {
    expect(collectTools({ integrations, tools: ['unknown/search'] })).toEqual(
      {},
    )
  })

  it('handles integration with no tool (just the name)', () => {
    expect(collectTools({ integrations, tools: ['slack'] })).toEqual({
      slack: { name: 'slack', tools: [] },
    })
  })

  it('handles integration with one specific tool', () => {
    expect(collectTools({ integrations, tools: ['google/search'] })).toEqual({
      google: { name: 'google', tools: ['search'] },
    })
  })

  it('accumulates multiple tools for the same integration', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/search', 'google/calendar'],
      }),
    ).toEqual({
      google: { name: 'google', tools: ['search', 'calendar'] },
    })
  })

  it('ignores duplicate tools', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/search', 'google/search', 'google/calendar'],
      }),
    ).toEqual({
      google: { name: 'google', tools: ['search', 'calendar'] },
    })
  })

  it('sets wildcard tool (*) to true', () => {
    expect(collectTools({ integrations, tools: ['slack/*'] })).toEqual({
      slack: { name: 'slack', tools: true },
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
      }),
    ).toEqual({
      google: { name: 'google', tools: true },
    })
  })

  it('ignores additional tools after wildcard', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/*', 'google/search', 'google/calendar'],
      }),
    ).toEqual({
      google: { name: 'google', tools: true },
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
        ],
      }),
    ).toEqual({
      google: { name: 'google', tools: ['search'] },
      slack: { name: 'slack', tools: true },
    })
  })

  it('returns empty when all entries are invalid', () => {
    expect(
      collectTools({
        integrations,
        tools: [123, {}, null, '/broken', 'invalid/tool'],
      }),
    ).toEqual({})
  })

  it('handles multiple integrations correctly', () => {
    expect(
      collectTools({
        integrations: [
          { name: 'google' } as IntegrationDto,
          { name: 'slack' } as IntegrationDto,
        ],
        tools: ['google/search', 'slack/*', 'latitude/summarize'],
      }),
    ).toEqual({
      google: { name: 'google', tools: ['search'] },
      slack: { name: 'slack', tools: true },
      latitude: { name: 'latitude', tools: ['summarize'] },
    })
  })

  it('handles integration names but empty tool segments (e.g. "google/")', () => {
    expect(
      collectTools({
        integrations,
        tools: ['google/', 'google/search'],
      }),
    ).toEqual({
      google: { name: 'google', tools: ['search'] },
    })
  })
})
