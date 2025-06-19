import { describe, expect, it } from 'vitest'
import { customDiff, CustomDiffType } from './customDiff'

describe('customDiff', () => {
  it('returns insertions', () => {
    const oldValue = 'Hello World'
    const newValue = 'Hello Beautiful World'
    const result = customDiff(oldValue, newValue)
    expect(result).toEqual([
      { type: CustomDiffType.EQUAL, length: 6 },
      { type: CustomDiffType.INSERT, text: 'Beautiful ', length: 10 },
    ])
  })

  it('returns deletions', () => {
    const oldValue = 'Hello Beautiful World'
    const newValue = 'Hello World'
    const result = customDiff(oldValue, newValue)
    expect(result).toEqual([
      { type: CustomDiffType.EQUAL, length: 6 },
      { type: CustomDiffType.DELETE, length: 10 },
    ])
  })

  it('merges insertions and deletions in "replace" actions', () => {
    const oldValue = 'Hello A World'
    const newValue = 'Hello B World'
    const result = customDiff(oldValue, newValue)
    expect(result).toEqual([
      { type: CustomDiffType.EQUAL, length: 6 },
      { type: CustomDiffType.REPLACE, text: 'B', length: 1 },
    ])
  })

  it('deletes the rest of the content before replacing with a smaller string', () => {
    const oldValue = 'My name is Carlos!'
    const newValue = 'My name is Alex!'
    const result = customDiff(oldValue, newValue)
    expect(result).toEqual([
      { type: CustomDiffType.EQUAL, length: 11 },
      { type: CustomDiffType.DELETE, length: 2 },
      { type: CustomDiffType.REPLACE, text: 'Alex', length: 4 },
    ])
  })

  it('inserts the rest of the content after replacing with a larger string', () => {
    const oldValue = 'My name is Alex!'
    const newValue = 'My name is Carlos!'
    const result = customDiff(oldValue, newValue)
    expect(result).toEqual([
      { type: CustomDiffType.EQUAL, length: 11 },
      { type: CustomDiffType.REPLACE, text: 'Carl', length: 4 },
      { type: CustomDiffType.INSERT, text: 'os', length: 2 },
    ])
  })
})
