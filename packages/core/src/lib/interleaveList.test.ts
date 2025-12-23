import { describe, expect, it } from 'vitest'
import { interleaveList } from './interleaveList'

describe('interleaveList', () => {
  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const result = interleaveList({}, 10)
      expect(result).toEqual([])
    })

    it('returns empty array when all lists are empty', () => {
      const result = interleaveList({ 1: [], 2: [], 3: [] }, 10)
      expect(result).toEqual([])
    })

    it('returns empty array when limit is 0', () => {
      const result = interleaveList({ 1: ['a', 'b', 'c'] }, 0)
      expect(result).toEqual([])
    })

    it('handles single source list', () => {
      const result = interleaveList({ 1: ['a', 'b', 'c'] }, Infinity, false)
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('filters out empty lists from sources', () => {
      const result = interleaveList(
        { 1: ['a', 'b'], 2: [], 3: ['c', 'd'] },
        Infinity,
        false,
      )
      expect(result).toHaveLength(4)
      expect(result).toContain('a')
      expect(result).toContain('b')
      expect(result).toContain('c')
      expect(result).toContain('d')
    })
  })

  describe('limit behavior', () => {
    it('respects limit when less than total available', () => {
      const result = interleaveList(
        { 1: ['a', 'b', 'c'], 2: ['d', 'e', 'f'] },
        4,
        false,
      )
      expect(result).toHaveLength(4)
    })

    it('returns all items when limit exceeds total available', () => {
      const result = interleaveList(
        { 1: ['a', 'b'], 2: ['c', 'd'] },
        100,
        false,
      )
      expect(result).toHaveLength(4)
    })

    it('uses Infinity as default limit', () => {
      const result = interleaveList({ 1: ['a', 'b', 'c', 'd', 'e'] })
      expect(result).toHaveLength(5)
    })
  })

  describe('proportional allocation', () => {
    it('allocates proportionally with equal-sized sources', () => {
      const result = interleaveList(
        {
          1: ['a1', 'a2', 'a3', 'a4'],
          2: ['b1', 'b2', 'b3', 'b4'],
        },
        8,
        false,
      )

      const countA = result.filter((x) => x.startsWith('a')).length
      const countB = result.filter((x) => x.startsWith('b')).length

      expect(countA).toBe(4)
      expect(countB).toBe(4)
    })

    it('allocates proportionally with unequal-sized sources', () => {
      const result = interleaveList(
        {
          1: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'],
          2: ['b1', 'b2', 'b3', 'b4', 'b5'],
          3: ['c1', 'c2', 'c3'],
        },
        18,
        false,
      )

      const countA = result.filter((x) => x.startsWith('a')).length
      const countB = result.filter((x) => x.startsWith('b')).length
      const countC = result.filter((x) => x.startsWith('c')).length

      expect(countA).toBe(10)
      expect(countB).toBe(5)
      expect(countC).toBe(3)
    })

    it('respects source limits even when proportional share is higher', () => {
      const result = interleaveList(
        {
          1: ['a1', 'a2'],
          2: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
        },
        10,
        false,
      )

      const countA = result.filter((x) => x.startsWith('a')).length
      const countB = result.filter((x) => x.startsWith('b')).length

      expect(countA).toBe(2)
      expect(countB).toBe(8)
    })
  })

  describe('interleaving distribution', () => {
    it('distributes items evenly throughout the result', () => {
      const result = interleaveList(
        {
          1: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
          2: ['b1', 'b2', 'b3'],
        },
        9,
        false,
      )

      const firstHalf = result.slice(0, 5)
      const secondHalf = result.slice(5)

      const firstHalfB = firstHalf.filter((x) => x.startsWith('b')).length
      const secondHalfB = secondHalf.filter((x) => x.startsWith('b')).length

      expect(firstHalfB).toBeGreaterThanOrEqual(1)
      expect(secondHalfB).toBeGreaterThanOrEqual(1)
    })

    it('maintains balance when split at any point', () => {
      const result = interleaveList(
        {
          1: Array.from({ length: 20 }, (_, i) => `a${i}`),
          2: Array.from({ length: 10 }, (_, i) => `b${i}`),
          3: Array.from({ length: 6 }, (_, i) => `c${i}`),
        },
        36,
        false,
      )

      const checkBalance = (slice: string[]) => {
        const countA = slice.filter((x) => x.startsWith('a')).length
        const countB = slice.filter((x) => x.startsWith('b')).length
        const countC = slice.filter((x) => x.startsWith('c')).length
        return { countA, countB, countC }
      }

      const first70 = result.slice(0, Math.floor(36 * 0.7))
      const last30 = result.slice(Math.floor(36 * 0.7))

      const first70Counts = checkBalance(first70)
      const last30Counts = checkBalance(last30)

      expect(first70Counts.countA).toBeGreaterThan(0)
      expect(first70Counts.countB).toBeGreaterThan(0)
      expect(first70Counts.countC).toBeGreaterThan(0)

      expect(last30Counts.countA).toBeGreaterThan(0)
      expect(last30Counts.countB).toBeGreaterThan(0)
      expect(last30Counts.countC).toBeGreaterThan(0)
    })

    it('does not cluster items from the same source at the end', () => {
      const result = interleaveList(
        {
          1: Array.from({ length: 15 }, (_, i) => `a${i}`),
          2: Array.from({ length: 5 }, (_, i) => `b${i}`),
        },
        20,
        false,
      )

      const last5 = result.slice(-5)
      const lastAllFromA = last5.every((x) => x.startsWith('a'))
      expect(lastAllFromA).toBe(false)
    })
  })

  describe('random behavior', () => {
    it('shuffles sources when random is true', () => {
      const input = { 1: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] }

      const results = new Set<string>()
      for (let i = 0; i < 10; i++) {
        results.add(interleaveList(input, Infinity, true).join(','))
      }

      expect(results.size).toBeGreaterThan(1)
    })

    it('preserves order when random is false', () => {
      const input = { 1: ['a', 'b', 'c'] }

      const result1 = interleaveList(input, Infinity, false)
      const result2 = interleaveList(input, Infinity, false)

      expect(result1).toEqual(result2)
      expect(result1).toEqual(['a', 'b', 'c'])
    })

    it('defaults to random=true', () => {
      const input = { 1: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] }

      const results = new Set<string>()
      for (let i = 0; i < 10; i++) {
        results.add(interleaveList(input).join(','))
      }

      expect(results.size).toBeGreaterThan(1)
    })
  })

  describe('allocation adjustment', () => {
    it('adjusts allocations to match exact target count', () => {
      const result = interleaveList(
        {
          1: ['a1', 'a2', 'a3'],
          2: ['b1', 'b2', 'b3'],
          3: ['c1', 'c2', 'c3'],
        },
        7,
        false,
      )

      expect(result).toHaveLength(7)
    })

    it('handles rounding edge cases correctly', () => {
      const result = interleaveList(
        {
          1: ['a1', 'a2', 'a3', 'a4', 'a5'],
          2: ['b1', 'b2', 'b3', 'b4', 'b5'],
          3: ['c1', 'c2', 'c3', 'c4', 'c5'],
        },
        13,
        false,
      )

      expect(result).toHaveLength(13)

      const countA = result.filter((x) => x.startsWith('a')).length
      const countB = result.filter((x) => x.startsWith('b')).length
      const countC = result.filter((x) => x.startsWith('c')).length

      expect(countA + countB + countC).toBe(13)
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
      expect(Math.abs(countB - countC)).toBeLessThanOrEqual(1)
    })
  })

  describe('type preservation', () => {
    it('preserves object types', () => {
      type Item = { id: number; category: string }
      const input: Record<number, Item[]> = {
        1: [
          { id: 1, category: 'a' },
          { id: 2, category: 'a' },
        ],
        2: [
          { id: 3, category: 'b' },
          { id: 4, category: 'b' },
        ],
      }

      const result = interleaveList(input, Infinity, false)

      expect(result).toHaveLength(4)
      result.forEach((item) => {
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('category')
      })
    })
  })

  describe('real-world scenario: train/test split', () => {
    it('produces balanced train/test splits for optimization datasets', () => {
      const negativesByIssue = {
        101: Array.from({ length: 50 }, (_, i) => ({
          type: 'neg',
          issue: 101,
          idx: i,
        })),
        102: Array.from({ length: 30 }, (_, i) => ({
          type: 'neg',
          issue: 102,
          idx: i,
        })),
        103: Array.from({ length: 20 }, (_, i) => ({
          type: 'neg',
          issue: 103,
          idx: i,
        })),
      }

      const targetNegatives = 100
      const trainSplit = 0.7

      const balancedNegatives = interleaveList(
        negativesByIssue,
        targetNegatives,
        false,
      )

      expect(balancedNegatives).toHaveLength(100)

      const trainNegatives = balancedNegatives.slice(
        0,
        Math.floor(targetNegatives * trainSplit),
      )
      const testNegatives = balancedNegatives.slice(
        Math.floor(targetNegatives * trainSplit),
      )

      const countByIssue = (list: typeof balancedNegatives) => ({
        101: list.filter((x) => x.issue === 101).length,
        102: list.filter((x) => x.issue === 102).length,
        103: list.filter((x) => x.issue === 103).length,
      })

      const trainCounts = countByIssue(trainNegatives)
      const testCounts = countByIssue(testNegatives)

      expect(trainCounts[101]).toBeGreaterThan(0)
      expect(trainCounts[102]).toBeGreaterThan(0)
      expect(trainCounts[103]).toBeGreaterThan(0)

      expect(testCounts[101]).toBeGreaterThan(0)
      expect(testCounts[102]).toBeGreaterThan(0)
      expect(testCounts[103]).toBeGreaterThan(0)

      const trainTotal = trainCounts[101] + trainCounts[102] + trainCounts[103]
      const testTotal = testCounts[101] + testCounts[102] + testCounts[103]

      expect(trainTotal).toBe(70)
      expect(testTotal).toBe(30)
    })
  })
})
