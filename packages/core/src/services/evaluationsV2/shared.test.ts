import { describe, expect, it } from 'vitest'
import { normalizeScore } from './shared'

describe('normalizeScore', () => {
  it('normalizes scores with different scales', async () => {
    expect(normalizeScore(1, 0, 1)).toEqual(100)
    expect(normalizeScore(0.5, 0, 1)).toEqual(50)
    expect(normalizeScore(0, 0, 1)).toEqual(0)

    expect(normalizeScore(1, 1, 0)).toEqual(0)
    expect(normalizeScore(0.5, 1, 0)).toEqual(50)
    expect(normalizeScore(0, 1, 0)).toEqual(100)

    expect(normalizeScore(5, 1, 5)).toEqual(100)
    expect(normalizeScore(4, 1, 5)).toEqual(75)
    expect(normalizeScore(3, 1, 5)).toEqual(50)
    expect(normalizeScore(2, 1, 5)).toEqual(25)
    expect(normalizeScore(1, 1, 5)).toEqual(0)

    expect(normalizeScore(5, 5, 1)).toEqual(0)
    expect(normalizeScore(4, 5, 1)).toEqual(25)
    expect(normalizeScore(3, 5, 1)).toEqual(50)
    expect(normalizeScore(2, 5, 1)).toEqual(75)
    expect(normalizeScore(1, 5, 1)).toEqual(100)

    expect(normalizeScore(100, 0, 100)).toEqual(100)
    expect(normalizeScore(75, 0, 100)).toEqual(75)
    expect(normalizeScore(50, 0, 100)).toEqual(50)
    expect(normalizeScore(25, 0, 100)).toEqual(25)
    expect(normalizeScore(0, 0, 100)).toEqual(0)

    expect(normalizeScore(100, 100, 0)).toEqual(0)
    expect(normalizeScore(75, 100, 0)).toEqual(25)
    expect(normalizeScore(50, 100, 0)).toEqual(50)
    expect(normalizeScore(25, 100, 0)).toEqual(75)
    expect(normalizeScore(0, 100, 0)).toEqual(100)

    expect(normalizeScore(5, 0, 1)).toEqual(100)
    expect(normalizeScore(5, 1, 0)).toEqual(0)
    expect(normalizeScore(-5, 0, 1)).toEqual(0)
    expect(normalizeScore(-5, 1, 0)).toEqual(100)

    expect(normalizeScore(1, 1, 1)).toEqual(100)
    expect(normalizeScore(0, 0, 0)).toEqual(100)
  })
})
