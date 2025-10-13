import { describe, it, expect } from 'vitest'
import { updateToolsFromActiveIntegrations as updateConfig } from './updateConfigWithActiveTools'
import { ActiveIntegrations, ActiveIntegration, ImageIcon } from './types'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationType } from '@latitude-data/constants'

function clientTool() {
  return {
    customTool: {
      description: 'Custom LLM utility',
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  }
}

function mockIntegration(
  name: string,
  tools: boolean | string[],
  id: number = 1,
): ActiveIntegration {
  return {
    id,
    name,
    type: IntegrationType.ExternalMCP,
    configuration: { url: 'http://localhost:3000' },
    icon: { type: 'icon', name: 'mcp' } as ImageIcon,
    tools,
    allToolNames: [],
    isOpen: false,
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
      google: mockIntegration('google', ['search', 'calendar'], 1),
      slack: mockIntegration('slack', true, 2),
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
      slack: mockIntegration('slack', ['messages'], 1),
      google: mockIntegration('google', ['search'], 2),
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
      slack: mockIntegration('slack', true),
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
      google: mockIntegration('google', true),
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
      google: mockIntegration('google', ['search', 'calendar']),
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
      google: mockIntegration('google', ['calendar'], 1),
      slack: mockIntegration('slack', true, 2),
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
      google: mockIntegration('google', ['calendar']),
    }

    const result = updateConfig({
      currentTools,
      activeIntegrations,
    })

    expect(result).toEqual(['google/calendar'])
  })
})
