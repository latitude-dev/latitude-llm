// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useActiveIntegrations } from './useActiveIntegrations'
import { trigger } from '$/lib/events'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'

// TODO: fix this test, i have to properly mock useIntegrations hook
describe.skip('useActiveIntegrations', () => {
  let mockOnChangePrompt: ReturnType<typeof vi.fn>
  let mockPrompt: string

  beforeEach(() => {
    mockOnChangePrompt = vi.fn()
    mockPrompt = `---
provider: test
model: gpt-4
tools:
  - test-integration/tool1
  - test-integration/tool2
---

Hello world`
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with empty active integrations when not loaded', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    expect(result.current.isInitialized).toBe(false)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should read active integrations from prompt config', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1', 'test-integration/tool2'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.isInitialized).toBe(true)
    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool1', 'tool2'],
    })
  })

  it('should handle wildcard tool selection', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/*'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': true,
    })
  })

  it('should filter out invalid integrations', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1', 'invalid-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool1'],
    })
  })

  it('should handle latitude built-in tools', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['latitude/search', 'test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({
      latitude: ['search'],
      'test-integration': ['tool1'],
    })
  })

  it('should add integration tool correctly', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.addIntegrationTool('test-integration', 'tool2')
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool1', 'tool2'],
    })
    expect(mockOnChangePrompt).toHaveBeenCalled()

    const calledWith = mockOnChangePrompt.mock?.calls?.[0]?.[0]
    expect(calledWith).toContain('test-integration/tool1')
    expect(calledWith).toContain('test-integration/tool2')
  })

  it('should add wildcard tool correctly', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.addIntegrationTool('test-integration', '*')
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': true,
    })
  })

  it('should not add duplicate tools', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.addIntegrationTool('test-integration', 'tool1')
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool1'],
    })
  })

  it('should remove integration tool correctly', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1', 'test-integration/tool2'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.removeIntegrationTool('test-integration', 'tool1', [
        'tool1',
        'tool2',
      ])
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool2'],
    })
    expect(mockOnChangePrompt).toHaveBeenCalled()

    const calledWith = mockOnChangePrompt.mock?.calls?.[0]?.[0]
    expect(calledWith).toContain('test-integration/tool2')
    expect(calledWith).not.toContain('test-integration/tool1')
  })

  it('should remove entire integration when removing last tool', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.removeIntegrationTool('test-integration', 'tool1', [
        'tool1',
      ])
    })

    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should handle removing wildcard correctly', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/*'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.removeIntegrationTool('test-integration', '*', [
        'tool1',
        'tool2',
      ])
    })

    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should convert wildcard to specific tools when removing one tool', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/*'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.removeIntegrationTool('test-integration', 'tool1', [
        'tool1',
        'tool2',
        'tool3',
      ])
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool2', 'tool3'],
    })
  })

  it('should handle empty tools array', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: [] as LatitudePromptConfig['tools'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should handle undefined tools', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: undefined,
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should handle non-array tools', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: {
              'test-tool': { description: 'test' },
            } as LatitudePromptConfig['tools'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should handle malformed tool strings', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: [
              'invalid-format',
              'test-integration/tool1',
              'another/invalid/format',
            ],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool1'],
    })
  })

  it('should handle non-string tools in array', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: [
              'test-integration/tool1',
              { name: 'object-tool', description: 'test' },
              'test-integration/tool2',
            ],
          },
        },
      })
    })

    expect(result.current.activeIntegrations).toEqual({
      'test-integration': ['tool1', 'tool2'],
    })
  })

  it('should not initialize when prompt is not loaded', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: false,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.isInitialized).toBe(false)
    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should not initialize when still loading', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    expect(result.current.isInitialized).toBe(false)
    expect(result.current.activeIntegrations).toEqual({})
  })

  it('should correctly update prompt metadata when adding tools', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: [] as LatitudePromptConfig['tools'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.addIntegrationTool('test-integration', 'new-tool')
    })

    expect(mockOnChangePrompt).toHaveBeenCalled()

    const updatedPrompt = mockOnChangePrompt.mock?.calls?.[0]?.[0]
    expect(updatedPrompt).toContain('test-integration/new-tool')

    const testResult = updatePromptMetadata(mockPrompt, {
      tools: ['test-integration/new-tool'],
    })
    expect(testResult).toContain('test-integration/new-tool')
  })

  it('should handle empty tools array in updatePromptMetadata', () => {
    const { result } = renderHook(() =>
      useActiveIntegrations({
        prompt: mockPrompt,
        onChangePrompt: mockOnChangePrompt,
      }),
    )

    act(() => {
      trigger('PromptMetadataChanged', {
        promptLoaded: true,
        // @ts-expect-error - mock
        metadata: {
          config: {
            tools: ['test-integration/tool1'],
          } as LatitudePromptConfig,
        },
      })
    })

    act(() => {
      result.current.removeIntegrationTool('test-integration', 'tool1', [
        'tool1',
      ])
    })

    expect(mockOnChangePrompt).toHaveBeenCalled()

    const testResult = updatePromptMetadata(mockPrompt, {
      tools: [],
    })

    expect(testResult).not.toContain('tools:')
  })
})
