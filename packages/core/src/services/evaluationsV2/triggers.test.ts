import { describe, expect, it } from 'vitest'
import { Span, SpanType, TriggerConfiguration } from '../../constants'
import { getTriggerTarget, selectSpansForTrigger } from './triggers'

function createSpan(id: string, startedAt = new Date()): Span {
  return {
    id,
    traceId: `trace-${id}`,
    type: SpanType.Prompt,
    startedAt,
    workspaceId: 1,
  } as unknown as Span
}

describe('getTriggerTarget', () => {
  it('defaults to every when trigger is undefined', () => {
    expect(getTriggerTarget(undefined)).toBe('every')
  })

  it('defaults to every when trigger has no target', () => {
    expect(getTriggerTarget({} as TriggerConfiguration)).toBe('every')
  })

  it('returns first when configured', () => {
    expect(getTriggerTarget({ target: 'first' })).toBe('first')
  })

  it('returns last when configured', () => {
    expect(getTriggerTarget({ target: 'last' })).toBe('last')
  })

  it('returns every when configured', () => {
    expect(getTriggerTarget({ target: 'every' })).toBe('every')
  })
})

describe('selectSpansForTrigger', () => {
  const spans = [
    createSpan('span-1', new Date('2024-01-01T00:00:00Z')),
    createSpan('span-2', new Date('2024-01-01T00:01:00Z')),
    createSpan('span-3', new Date('2024-01-01T00:02:00Z')),
  ]

  it('returns empty array when given no spans', () => {
    expect(selectSpansForTrigger([], 'first')).toEqual([])
    expect(selectSpansForTrigger([], 'last')).toEqual([])
    expect(selectSpansForTrigger([], 'every')).toEqual([])
  })

  describe('first', () => {
    it('selects only the first span', () => {
      const result = selectSpansForTrigger(spans, 'first')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('span-1')
    })

    it('works with a single span', () => {
      const result = selectSpansForTrigger([spans[0]!], 'first')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('span-1')
    })
  })

  describe('last', () => {
    it('selects only the last span', () => {
      const result = selectSpansForTrigger(spans, 'last')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('span-3')
    })

    it('works with a single span', () => {
      const result = selectSpansForTrigger([spans[0]!], 'last')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('span-1')
    })
  })

  describe('every', () => {
    it('selects all spans', () => {
      const result = selectSpansForTrigger(spans, 'every')
      expect(result).toHaveLength(3)
      expect(result.map((s) => s.id)).toEqual(['span-1', 'span-2', 'span-3'])
    })

    it('works with a single span', () => {
      const result = selectSpansForTrigger([spans[0]!], 'every')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('span-1')
    })
  })
})
