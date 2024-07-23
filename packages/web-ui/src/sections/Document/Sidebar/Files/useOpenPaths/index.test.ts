import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useOpenPaths } from './index'

describe('useOpenPaths', () => {
  it('shout add the paths', async () => {
    const { result } = renderHook(() => useOpenPaths((state) => state))
    act(() => {
      result.current.togglePath('some-folder/nested-folder/doc1')
    })

    expect(result.current.openPaths).toEqual([
      '',
      'some-folder',
      'some-folder/nested-folder',
      'some-folder/nested-folder/doc1',
    ])
  })

  it('shout remove nested paths', async () => {
    const { result } = renderHook(() => useOpenPaths((state) => state))
    act(() => {
      result.current.togglePath('some-folder/nested-folder/doc1')
    })

    act(() => {
      result.current.togglePath('some-folder/nested-folder')
    })
    expect(result.current.openPaths).toEqual(['', 'some-folder'])
  })
})
