import { describe, expect, it } from 'vitest'
import { calculateMCC } from './calculateMCC'
import { Result } from '@latitude-data/core/lib/Result'

describe('calculateMCC', () => {
  it('calculates perfect MCC (1.0) when all classifications are correct', () => {
    const examplesThatShouldPassTheEvaluation = [true, true, true]

    const examplesThatShouldFailTheEvaluation = [false, false, false]

    const mccResult = calculateMCC({
      examplesThatShouldPassTheEvaluation,
      examplesThatShouldFailTheEvaluation,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const { mcc, confusionMatrix } = mccResult.unwrap()
    expect(mcc).toBe(100)
    expect(confusionMatrix).toEqual({
      truePositives: 3,
      trueNegatives: 3,
      falsePositives: 0,
      falseNegatives: 0,
    })
  })

  it('calculates worst MCC (-1.0) when all classifications are incorrect', () => {
    const examplesThatShouldPassTheEvaluation = [false, false]
    const examplesThatShouldFailTheEvaluation = [true, true]

    const mccResult = calculateMCC({
      examplesThatShouldPassTheEvaluation,
      examplesThatShouldFailTheEvaluation,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const { mcc, confusionMatrix } = mccResult.unwrap()
    expect(mcc).toBe(0)
    expect(confusionMatrix).toEqual({
      truePositives: 0,
      trueNegatives: 0,
      falsePositives: 2,
      falseNegatives: 2,
    })
  })

  it('returns 0 when all positive results are false positives (no true positives)', () => {
    // Edge case where all positive results are false positives (no true positives)
    const examplesThatShouldPassTheEvaluation = [false, false]

    const examplesThatShouldFailTheEvaluation = [false]

    const mccResult = calculateMCC({
      examplesThatShouldPassTheEvaluation,
      examplesThatShouldFailTheEvaluation,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const { mcc, confusionMatrix } = mccResult.unwrap()
    expect(mcc).toBe(0)
    expect(confusionMatrix).toEqual({
      truePositives: 0,
      trueNegatives: 1,
      falsePositives: 2,
      falseNegatives: 0,
    })
  })

  it('handles empty positive results array', () => {
    const examplesThatShouldFailTheEvaluation = [false, false]

    const mccResult = calculateMCC({
      examplesThatShouldPassTheEvaluation: [],
      examplesThatShouldFailTheEvaluation,
    })

    expect(Result.isOk(mccResult)).toBe(false)
  })

  it('handles empty negative results array', () => {
    const examplesThatShouldPassTheEvaluation = [true, true]

    const mccResult = calculateMCC({
      examplesThatShouldPassTheEvaluation,
      examplesThatShouldFailTheEvaluation: [],
    })

    expect(Result.isOk(mccResult)).toBe(false)
  })

  it('handles both empty arrays', () => {
    const mccResult = calculateMCC({
      examplesThatShouldPassTheEvaluation: [],
      examplesThatShouldFailTheEvaluation: [],
    })

    expect(Result.isOk(mccResult)).toBe(false)
  })

  it('calculates MCC correctly with large datasets', () => {
    const examplesThatShouldPassTheEvaluation = Array.from({ length: 10 }, (_, i) => i < 8)

    const examplesThatShouldFailTheEvaluation = Array.from({ length: 10 }, (_, i) => i < 2)

    const mccResult = calculateMCC({
      examplesThatShouldPassTheEvaluation,
      examplesThatShouldFailTheEvaluation,
    })

    expect(Result.isOk(mccResult)).toBe(true)
    const { mcc, confusionMatrix } = mccResult.unwrap()
    expect(mcc).toBe(80)
    expect(confusionMatrix).toEqual({
      truePositives: 8,
      trueNegatives: 8,
      falsePositives: 2,
      falseNegatives: 2,
    })
  })
})
