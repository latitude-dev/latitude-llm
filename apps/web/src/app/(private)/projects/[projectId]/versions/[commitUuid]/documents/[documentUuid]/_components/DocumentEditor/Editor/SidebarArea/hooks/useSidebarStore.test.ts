/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useSidebarStore as useActiveIntegrationsStore } from './useSidebarStore'
import { IntegrationType } from '@latitude-data/constants'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { ActiveIntegration } from '../toolsHelpers/types'

describe('useActiveIntegrationsStore', () => {
  // Helper to reset store state
  const resetStore = () => {
    const { result } = renderHook(() => useActiveIntegrationsStore())
    act(() => {
      result.current.buildIntegrations({ tools: [], integrations: [] })
      result.current.setInitialized(false)
    })
  }

  beforeEach(() => {
    resetStore()
  })

  const mockIntegrationDto = (
    name: string,
    id: number = 1,
  ): IntegrationDto => ({
    id,
    name,
    type: IntegrationType.ExternalMCP,
    configuration: { url: 'http://localhost:3000' },
    hasTools: true,
    hasTriggers: false,
    workspaceId: 1,
    authorId: 'test-author',
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    mcpServerId: null,
  })

  const mockActiveIntegration = (
    name: string,
    tools: boolean | string[] = [],
    id: number = 1,
  ): ActiveIntegration => ({
    id,
    name,
    type: IntegrationType.ExternalMCP,
    configuration: null,
    icon: { type: 'icon', name: 'mcp' },
    tools,
    allToolNames: [],
    isOpen: false,
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())

      expect(result.current.initialized).toBe(false)
      expect(result.current.integrations).toEqual([])
      expect(result.current.integrationsMap).toEqual({})
      expect(result.current.promptConfigTools).toEqual([])
    })
  })

  describe('buildIntegrations', () => {
    it('should build integrations from tools config', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'slack/message'],
          integrations,
        })
      })

      expect(result.current.initialized).toBe(true)
      expect(result.current.integrations).toHaveLength(2)
      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[1].name).toBe('slack')
    })

    it('should preserve order of existing integrations when rebuilding', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
        mockIntegrationDto('notion', 3),
      ]

      // Initial build with google at position 0
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [integrations[0]],
        })
      })

      // Add slack at the top
      act(() => {
        result.current.addIntegration({
          integration: mockActiveIntegration('slack', [], 2),
          toolName: '*',
        })
      })

      // Rebuild should preserve slack at top
      act(() => {
        result.current.buildIntegrations({
          tools: ['slack/*', 'google/search'],
          integrations: [integrations[0], integrations[1]],
        })
      })

      expect(result.current.integrations[0].name).toBe('slack')
      expect(result.current.integrations[1].name).toBe('google')
    })

    it('should add new integrations at the end when rebuilding', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      // Initial build with google
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [integrations[0]],
        })
      })

      // Rebuild with slack added
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'slack/message'],
          integrations,
        })
      })

      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[1].name).toBe('slack')
    })

    it('should collect client tools as a special integration', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [mockIntegrationDto('google')]

      act(() => {
        result.current.buildIntegrations({
          tools: [
            'google/search',
            {
              get_weather: {
                description: 'Get weather',
              },
            },
            {
              calculate_sum: {
                description: 'Calculate sum',
              },
            },
          ],
          integrations,
        })
      })

      expect(result.current.integrations).toHaveLength(2)
      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[1].name).toBe('client-tools')
      expect(result.current.integrations[1].tools).toEqual([
        'get_weather',
        'calculate_sum',
      ])
      expect(result.current.integrations[1].allToolNames).toEqual([
        'get_weather',
        'calculate_sum',
      ])
    })

    it('should remove integrations not in new config', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'slack/message'],
          integrations,
        })
      })

      expect(result.current.integrations).toHaveLength(2)

      // Rebuild with only google
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [integrations[0]],
        })
      })

      expect(result.current.integrations).toHaveLength(1)
      expect(result.current.integrations[0].name).toBe('google')
    })
  })

  describe('addIntegration', () => {
    it('should add new integration at the top with isOpen: true', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      // Build with google
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [integrations[0]],
        })
      })

      // Add slack
      act(() => {
        result.current.addIntegration({
          integration: mockActiveIntegration('slack', [], 2),
          toolName: '*',
        })
      })

      expect(result.current.integrations).toHaveLength(2)
      expect(result.current.integrations[0].name).toBe('slack')
      expect(result.current.integrations[0].isOpen).toBe(true)
      expect(result.current.integrations[0].tools).toBe(true)
      expect(result.current.integrations[1].name).toBe('google')
    })

    it('should add integration with specific tools', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())

      act(() => {
        result.current.addIntegration({
          integration: mockActiveIntegration('google'),
          toolName: 'search',
        })
      })

      expect(result.current.integrations[0].tools).toEqual(['search'])
    })

    it('should add integration with no tools enabled when toolName is empty', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())

      act(() => {
        result.current.addIntegration({
          integration: mockActiveIntegration('google'),
          toolName: '',
        })
      })

      expect(result.current.integrations[0].tools).toEqual([])
      expect(result.current.integrations[0].isOpen).toBe(true)
      expect(result.current.integrations[0].name).toBe('google')
    })
  })

  describe('addTool', () => {
    it('should add tool to existing integration and preserve order', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'slack/message'],
          integrations,
        })
      })

      act(() => {
        result.current.addTool({
          integrationName: 'google',
          toolName: 'calendar',
        })
      })

      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[0].tools).toContain('calendar')
      expect(result.current.integrations[1].name).toBe('slack')
    })

    it('should set tools to true when adding wildcard', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [mockIntegrationDto('google')],
        })
      })

      act(() => {
        result.current.addTool({
          integrationName: 'google',
          toolName: '*',
        })
      })

      expect(result.current.integrations[0].tools).toBe(true)
    })
  })

  describe('removeTool', () => {
    it('should remove tool from integration and preserve order', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'google/calendar', 'slack/message'],
          integrations,
        })
      })

      act(() => {
        result.current.removeTool({
          integrationName: 'google',
          toolName: 'search',
          allToolNames: ['search', 'calendar'],
        })
      })

      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[0].tools).toEqual(['calendar'])
      expect(result.current.integrations[1].name).toBe('slack')
    })

    it('should remove all tools when removing wildcard', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/*'],
          integrations: [mockIntegrationDto('google')],
        })
      })

      act(() => {
        result.current.removeTool({
          integrationName: 'google',
          toolName: '*',
          allToolNames: ['search', 'calendar'],
        })
      })

      expect(result.current.integrations[0].tools).toEqual([])
    })
  })

  describe('removeIntegration', () => {
    it('should remove integration and preserve order of remaining', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
        mockIntegrationDto('notion', 3),
      ]

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'slack/message', 'notion/page'],
          integrations,
        })
      })

      act(() => {
        result.current.removeIntegration('slack')
      })

      expect(result.current.integrations).toHaveLength(2)
      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[1].name).toBe('notion')
      expect(result.current.integrationsMap.slack).toBeUndefined()
    })
  })

  describe('setIntegrationToolNames', () => {
    it('should set allToolNames and preserve order', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'slack/message'],
          integrations,
        })
      })

      act(() => {
        result.current.setIntegrationToolNames({
          integrationName: 'google',
          toolNames: ['search', 'calendar', 'drive'],
        })
      })

      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[0].allToolNames).toEqual([
        'search',
        'calendar',
        'drive',
      ])
      expect(result.current.integrations[1].name).toBe('slack')
    })
  })

  describe('toggleIntegration', () => {
    it('should toggle isOpen and preserve order', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())

      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [mockIntegrationDto('google')],
        })
      })

      expect(result.current.integrations[0].isOpen).toBe(false)

      act(() => {
        result.current.toggleIntegration('google')
      })

      expect(result.current.integrations[0].name).toBe('google')
      expect(result.current.integrations[0].isOpen).toBe(true)

      act(() => {
        result.current.toggleIntegration('google')
      })

      expect(result.current.integrations[0].isOpen).toBe(false)
    })
  })

  describe('order preservation in complex scenarios', () => {
    it('should maintain order through multiple operations', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
        mockIntegrationDto('notion', 3),
      ]

      // 1. Build with google
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [integrations[0]],
        })
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual(['google'])

      // 2. Add slack at top
      act(() => {
        result.current.addIntegration({
          integration: mockActiveIntegration('slack', [], 2),
          toolName: '*',
        })
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual([
        'slack',
        'google',
      ])

      // 3. Add notion at top
      act(() => {
        result.current.addIntegration({
          integration: mockActiveIntegration('notion', [], 3),
          toolName: 'page',
        })
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual([
        'notion',
        'slack',
        'google',
      ])

      // 4. Add tool to slack (should preserve order)
      act(() => {
        result.current.addTool({
          integrationName: 'slack',
          toolName: 'channel',
        })
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual([
        'notion',
        'slack',
        'google',
      ])

      // 5. Set tool names for notion (should preserve order)
      act(() => {
        result.current.setIntegrationToolNames({
          integrationName: 'notion',
          toolNames: ['page', 'database'],
        })
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual([
        'notion',
        'slack',
        'google',
      ])

      // 6. Toggle notion (should preserve order)
      act(() => {
        result.current.toggleIntegration('notion')
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual([
        'notion',
        'slack',
        'google',
      ])

      // 7. Remove slack (should preserve order)
      act(() => {
        result.current.removeIntegration('slack')
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual([
        'notion',
        'google',
      ])

      // 8. Rebuild (should preserve order)
      act(() => {
        result.current.buildIntegrations({
          tools: ['notion/page', 'google/search'],
          integrations: [integrations[2], integrations[0]],
        })
      })
      expect(result.current.integrations.map((i) => i.name)).toEqual([
        'notion',
        'google',
      ])
    })
  })

  describe('reset', () => {
    it('should reset all integrations state to initial values', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      // Build with some integrations
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search', 'slack/message'],
          integrations,
        })
      })

      // Verify state is not initial
      expect(result.current.initialized).toBe(true)
      expect(result.current.integrations).toHaveLength(2)
      expect(result.current.integrationsMap).not.toEqual({})
      expect(result.current.promptConfigTools).toEqual([
        'google/search',
        'slack/message',
      ])

      // Reset
      act(() => {
        result.current.reset()
      })

      // Verify all state is reset to initial values
      expect(result.current.initialized).toBe(false)
      expect(result.current.integrations).toEqual([])
      expect(result.current.integrationsMap).toEqual({})
      expect(result.current.promptConfigTools).toEqual([])
    })

    it('should reset all sub-agents state to initial values', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())

      // Set some sub-agents state
      act(() => {
        result.current.setSelectedAgents(['agent1.prompt', 'agent2.prompt'])
        result.current.setPathToUuidMap({
          'agent1.prompt': 'uuid1',
          'agent2.prompt': 'uuid2',
        })
      })

      // Verify state is not initial
      expect(result.current.selectedAgents).toEqual([
        'agent1.prompt',
        'agent2.prompt',
      ])
      expect(result.current.pathToUuidMap).toEqual({
        'agent1.prompt': 'uuid1',
        'agent2.prompt': 'uuid2',
      })

      // Reset
      act(() => {
        result.current.reset()
      })

      // Verify all state is reset to initial values
      expect(result.current.selectedAgents).toEqual([])
      expect(result.current.pathToUuidMap).toEqual({})
    })

    it('should reset all state after complex operations', () => {
      const { result } = renderHook(() => useActiveIntegrationsStore())
      const integrations = [
        mockIntegrationDto('google'),
        mockIntegrationDto('slack', 2),
      ]

      // Perform multiple operations
      act(() => {
        result.current.buildIntegrations({
          tools: ['google/search'],
          integrations: [integrations[0]],
        })
      })

      act(() => {
        result.current.addIntegration({
          integration: mockActiveIntegration('slack', [], 2),
          toolName: '*',
        })
      })

      act(() => {
        result.current.toggleIntegration('google')
      })

      act(() => {
        result.current.setSelectedAgents(['agent1.prompt'])
      })

      // Verify state is not initial
      expect(result.current.integrations).toHaveLength(2)
      expect(result.current.initialized).toBe(true)
      expect(result.current.selectedAgents).toHaveLength(1)

      // Reset
      act(() => {
        result.current.reset()
      })

      // Verify everything is back to initial state
      expect(result.current.initialized).toBe(false)
      expect(result.current.integrations).toEqual([])
      expect(result.current.integrationsMap).toEqual({})
      expect(result.current.promptConfigTools).toEqual([])
      expect(result.current.selectedAgents).toEqual([])
      expect(result.current.pathToUuidMap).toEqual({})
    })
  })
})
