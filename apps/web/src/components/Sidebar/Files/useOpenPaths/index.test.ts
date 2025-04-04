// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useOpenPaths } from './index'

describe('useOpenPaths', () => {
  afterEach(() => {
    useOpenPaths.getState().reset()
  })

  it('shout add the paths', async () => {
    const { result } = renderHook(() => useOpenPaths((state) => state))
    act(() => {
      result.current.togglePath('some-folder/nested-folder/doc1')
    })

    expect(result.current.openPaths).toEqual({
      'some-folder': true,
      'some-folder/nested-folder': true,
      'some-folder/nested-folder/doc1': true,
    })
  })

  it('should close nested-folder', async () => {
    const { result } = renderHook(() => useOpenPaths((state) => state))
    act(() => {
      result.current.togglePath('some-folder/level1/level2/level3/doc1')
    })

    act(() => {
      result.current.togglePath('some-folder/level1/level2')
    })

    expect(result.current.openPaths).toEqual({
      'some-folder': true,
      'some-folder/level1': true,
      'some-folder/level1/level2': false,
      'some-folder/level1/level2/level3': true,
      'some-folder/level1/level2/level3/doc1': true,
    })
  })
})
