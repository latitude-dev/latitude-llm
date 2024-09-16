// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { trimStartSpace, useWritePromptProvider } from './index'

describe('useWritePromptProvider', () => {
  it('parse and empty prompt and set provider', () => {
    const onChangePromptMock = vi.fn()
    const { result } = renderHook(() =>
      useWritePromptProvider({
        prompt: '',
        onChangePrompt: onChangePromptMock,
      }),
    )
    act(() => {
      result.current.onProviderDataChange({ name: 'openai', model: 'gpt-4o' })
    })
    expect(onChangePromptMock).toHaveBeenCalledWith(
      trimStartSpace(`
        ---
        provider: openai
        model: gpt-4o
        ---
      `),
    )
  })

  it('parse a prompt with a provider and set a new provider', () => {
    const onChangePromptMock = vi.fn()
    const { result } = renderHook(() =>
      useWritePromptProvider({
        prompt: trimStartSpace(`
          ---
          provider: openai
          model: gpt-4o
          ---
        `),
        onChangePrompt: onChangePromptMock,
      }),
    )
    act(() => {
      result.current.onProviderDataChange({
        name: 'mistral',
        model: 'open-mistral-nemo-2407',
      })
    })
    expect(onChangePromptMock).toHaveBeenCalledWith(
      trimStartSpace(`---
        provider: mistral
        model: open-mistral-nemo-2407
        ---
      `),
    )
  })

  it('parse a prompt with only a provider', () => {
    const onChangePromptMock = vi.fn()
    const { result } = renderHook(() =>
      useWritePromptProvider({
        prompt: trimStartSpace(`
          ---
          provider: openai
          ---
        `),
        onChangePrompt: onChangePromptMock,
      }),
    )
    act(() => {
      result.current.onProviderDataChange({
        name: 'mistral',
        model: 'open-mistral-nemo-2407',
      })
    })
    expect(onChangePromptMock).toHaveBeenCalledWith(
      trimStartSpace(`---
        provider: mistral
        model: open-mistral-nemo-2407
        ---
      `),
    )
  })

  it('parse a prompt with temperature but not model or provider', () => {
    const onChangePromptMock = vi.fn()
    const { result } = renderHook(() =>
      useWritePromptProvider({
        prompt: trimStartSpace(`
          ---
          temperature: 0.5
          ---
        `),
        onChangePrompt: onChangePromptMock,
      }),
    )
    act(() => {
      result.current.onProviderDataChange({
        name: 'mistral',
        model: 'open-mistral-nemo-2407',
      })
    })
    expect(onChangePromptMock).toHaveBeenCalledWith(
      trimStartSpace(`---
        temperature: 0.5
        provider: mistral
        model: open-mistral-nemo-2407
        ---
      `),
    )
  })

  it('with a comment before yaml header', () => {
    const onChangePromptMock = vi.fn()
    const { result } = renderHook(() =>
      useWritePromptProvider({
        prompt: trimStartSpace(`
          /* This is a comment */
          ---
          temperature: 0.5
          ---
        `),
        onChangePrompt: onChangePromptMock,
      }),
    )
    act(() => {
      result.current.onProviderDataChange({
        name: 'mistral',
        model: 'open-mistral-nemo-2407',
      })
    })
    expect(onChangePromptMock).toHaveBeenCalledWith(
      trimStartSpace(`/* This is a comment */
        ---
        temperature: 0.5
        provider: mistral
        model: open-mistral-nemo-2407
        ---
      `),
    )
  })
})
