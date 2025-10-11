import { describe, it, expect } from 'vitest'
import { updateToolsFromActiveIntegrations as updateConfig } from './updateConfigWithActiveTools'
import { ActiveIntegrations } from './types'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

function clientTool() {
  return {
    customTool: {
      description: 'Custom LLM utility',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  }
}

describe('updateConfig (updateToolsFromActiveIntegrations)', () => {
  it('returns an empty array when both inputs are empty', () => {
    expect(
      updateConfig({
        currentTools: [],
        activeIntegrations: {},
      }),
    ).toEqual([])
  })

  it('preserves client tools when no integrations are provided', () => {
    const result = updateConfig({
      currentTools: [clientTool()],
      activeIntegrations: {},
    })

    expect(result).toEqual([clientTool()])
  })

  it('adds new integration tools from active integrations', () => {
    const activeIntegrations: ActiveIntegrations = {
      google: { name: 'google', tools: ['search', 'calendar'] },
      slack: { name: 'slack', tools: true },
    }

    const result = updateConfig({
      currentTools: [clientTool()],
      activeIntegrations,
    })

    expect(result).toEqual([
      clientTool(),
      'google/search',
      'google/calendar',
      'slack/*',
    ])
  })

  it('replaces integrations and appends them after client tools', () => {
    const currentTools: LatitudePromptConfig['tools'] = [
      { some_custom_tool: { description: '...' } },
      'slack/*',
      { other_custom_tool: { description: '...' } },
    ]

    const activeIntegrations: ActiveIntegrations = {
      slack: { name: 'slack', tools: ['messages'] },
      google: { name: 'google', tools: ['search'] },
    }

    const result = updateConfig({
      currentTools,
      activeIntegrations,
    })

    expect(result).toEqual([
      { some_custom_tool: { description: '...' } },
      'slack/messages',
      { other_custom_tool: { description: '...' } },
      'google/search',
    ])
  })

  it('keeps only integrations from activeIntegrations (removes others) while preserving client tools', () => {
    const currentTools = [
      { client_tool: { description: '...' } },
      'notion/read',
      'google/search',
    ]
    const activeIntegrations: ActiveIntegrations = {
      slack: { name: 'slack', tools: true },
    }

    const result = updateConfig({
      currentTools,
      activeIntegrations,
    })

    expect(result).toEqual([{ client_tool: { description: '...' } }, 'slack/*'])
  })

  it('handles wildcard integrations correctly', () => {
    const currentTools = [clientTool(), 'google/search']
    const activeIntegrations: ActiveIntegrations = {
      google: { name: 'google', tools: true },
    }

    const result = updateConfig({
      currentTools,
      activeIntegrations,
    })

    expect(result).toEqual([clientTool(), 'google/*'])
  })

  it('deduplicates integration tools', () => {
    const currentTools = [clientTool(), 'google/search', 'google/calendar']
    const activeIntegrations: ActiveIntegrations = {
      google: { name: 'google', tools: ['search', 'calendar'] },
    }

    const result = updateConfig({
      currentTools,
      activeIntegrations,
    })

    expect(result).toEqual([clientTool(), 'google/search', 'google/calendar'])
  })

  it('handles mixed client and integration tools correctly (client tools first, integrations appended)', () => {
    const currentTools = [
      'google/search',
      { llmHelper: { description: 'LLM helper tool' } },
      'latitude/search',
    ]
    const activeIntegrations: ActiveIntegrations = {
      google: { name: 'google', tools: ['calendar'] },
      slack: { name: 'slack', tools: true },
    }

    const result = updateConfig({
      currentTools,
      activeIntegrations,
    })

    expect(result).toEqual([
      'google/calendar',
      { llmHelper: { description: 'LLM helper tool' } },
      'slack/*',
    ])
  })

  it('removes integrations not present in activeIntegrations', () => {
    const currentTools = ['notion/read', 'google/search']
    const activeIntegrations: ActiveIntegrations = {
      google: { name: 'google', tools: ['calendar'] },
    }

    const result = updateConfig({
      currentTools,
      activeIntegrations,
    })

    expect(result).toEqual(['google/calendar'])
  })
})
