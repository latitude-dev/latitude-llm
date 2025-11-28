import { describe, expect, it } from 'vitest'
import { calculateMCC } from './calculateMCC'
import { Result } from '../../lib/Result'

describe('calculateMCC', () => {
  it('calculates perfect MCC (1.0) when all classifications are correct', () => {
    const positiveResults = [true, true, true]

    const negativeResults = [false, false, false]

    const mccResult = calculateMCC({
      positiveEvaluationResults: positiveResults,
      negativeEvaluationResults: negativeResults,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const mcc = mccResult.unwrap()
    expect(mcc).toBe(100)
  })

  it('calculates worst MCC (-1.0) when all classifications are incorrect', () => {
    const positiveResults = [false, false]
    const negativeResults = [true, true]

    const mccResult = calculateMCC({
      positiveEvaluationResults: positiveResults,
      negativeEvaluationResults: negativeResults,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const mcc = mccResult.unwrap()
    expect(mcc).toBe(0)
  })

  it('returns 0 when all positive results are false positives (no true positives)', () => {
    // Edge case where all positive results are false positives (no true positives)
    const positiveResults = [false, false]

    const negativeResults = [false]

    const mccResult = calculateMCC({
      positiveEvaluationResults: positiveResults,
      negativeEvaluationResults: negativeResults,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const mcc = mccResult.unwrap()
    expect(mcc).toBe(0)
  })

  it('handles empty positive results array', () => {
    const negativeResults = [false, false]

    const mccResult = calculateMCC({
      positiveEvaluationResults: [],
      negativeEvaluationResults: negativeResults,
    })

    expect(Result.isOk(mccResult)).toBe(false)
  })

  it('handles empty negative results array', () => {
    const positiveResults = [true, true]

    const mccResult = calculateMCC({
      positiveEvaluationResults: positiveResults,
      negativeEvaluationResults: [],
    })

    expect(Result.isOk(mccResult)).toBe(false)
  })

  it('handles both empty arrays', () => {
    const mccResult = calculateMCC({
      positiveEvaluationResults: [],
      negativeEvaluationResults: [],
    })

    expect(Result.isOk(mccResult)).toBe(false)
  })

  it('calculates MCC correctly with large datasets', () => {
    const positiveResults = Array.from({ length: 10 }, (_, i) => i < 8)

    const negativeResults = Array.from({ length: 10 }, (_, i) => i < 2)

    const mccResult = calculateMCC({
      positiveEvaluationResults: positiveResults,
      negativeEvaluationResults: negativeResults,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const mcc = mccResult.unwrap()
    expect(mcc).toBe(80)
  })
})
