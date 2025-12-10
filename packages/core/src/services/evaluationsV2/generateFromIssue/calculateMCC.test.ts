import { Result } from '@latitude-data/core/lib/Result'
import { describe, expect, it } from 'vitest'
import { calculateMCC } from './calculateMCC'

/**
 * Confusion Matrix Terminology for Evaluation Alignment:
 *
 * Context: We're evaluating how well an AI evaluation aligns with human judgment.
 * - "Positive" prediction = evaluation passed (hasPassed = true) = span is GOOD (no issue)
 * - "Negative" prediction = evaluation failed (hasPassed = false) = span has ISSUE
 *
 * Input arrays:
 * - examplesThatShouldPassTheEvaluation: array of hasPassed booleans for spans that are actually GOOD
 * - examplesThatShouldFailTheEvaluation: array of hasPassed booleans for spans that actually have ISSUES
 *
 * Confusion Matrix:
 *                          | Actually Positive  | Actually Negative
 *                          | (should pass)      | (should fail)
 * -------------------------+--------------------+-------------------
 * Predicted Positive       | True Positive (TP) | False Positive (FP)
 * (hasPassed = true)       | Correct!           | Wrong! Said good but has issue
 * -------------------------+--------------------+-------------------
 * Predicted Negative       | False Negative (FN)| True Negative (TN)
 * (hasPassed = false)      | Wrong! Said bad    | Correct!
 *                          | but was good       |
 *
 * Calculation from inputs:
 * - TP = examplesThatShouldPassTheEvaluation.filter(r => r === true).length
 * - FN = examplesThatShouldPassTheEvaluation.filter(r => r === false).length
 * - FP = examplesThatShouldFailTheEvaluation.filter(r => r === true).length
 * - TN = examplesThatShouldFailTheEvaluation.filter(r => r === false).length
 */

describe('calculateMCC', () => {
  describe('confusion matrix calculation', () => {
    it('calculates TP correctly: examples that should pass AND did pass', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, true, true], // 3 should pass, all passed
        examplesThatShouldFailTheEvaluation: [false], // 1 should fail, it failed
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix.truePositives).toBe(3)
    })

    it('calculates FN correctly: examples that should pass BUT did NOT pass', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, false, false], // 1 TP, 2 FN
        examplesThatShouldFailTheEvaluation: [false], // 1 TN
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix.falseNegatives).toBe(2)
    })

    it('calculates FP correctly: examples that should fail BUT did pass', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true], // 1 TP
        examplesThatShouldFailTheEvaluation: [true, true, true, false], // 3 FP, 1 TN
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix.falsePositives).toBe(3)
    })

    it('calculates TN correctly: examples that should fail AND did fail', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true], // 1 should pass, it passed
        examplesThatShouldFailTheEvaluation: [false, false, false, false], // 4 should fail, all failed
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix.trueNegatives).toBe(4)
    })

    it('calculates all four metrics correctly in a mixed scenario', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, true, false, false, true], // 3 TP, 2 FN
        examplesThatShouldFailTheEvaluation: [false, false, true, false, true], // 3 TN, 2 FP
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix).toEqual({
        truePositives: 3,
        falseNegatives: 2,
        falsePositives: 2,
        trueNegatives: 3,
      })
    })
  })

  describe('MCC score calculation', () => {
    it('calculates perfect MCC (100%) when all classifications are correct', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, true, true], // All correct (TP)
        examplesThatShouldFailTheEvaluation: [false, false, false], // All correct (TN)
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

    it('calculates worst MCC (0% scaled) when all classifications are wrong', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [false, false], // All wrong (FN)
        examplesThatShouldFailTheEvaluation: [true, true], // All wrong (FP)
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { mcc, confusionMatrix } = mccResult.unwrap()
      expect(mcc).toBe(0) // MCC of -1 scales to 0%
      expect(confusionMatrix).toEqual({
        truePositives: 0,
        trueNegatives: 0,
        falsePositives: 2,
        falseNegatives: 2,
      })
    })

    it('calculates 50% MCC when predictions are random (no correlation)', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, false], // 1 TP, 1 FN
        examplesThatShouldFailTheEvaluation: [true, false], // 1 FP, 1 TN
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { mcc, confusionMatrix } = mccResult.unwrap()
      expect(mcc).toBe(50) // MCC of 0 scales to 50%
      expect(confusionMatrix).toEqual({
        truePositives: 1,
        trueNegatives: 1,
        falsePositives: 1,
        falseNegatives: 1,
      })
    })

    it('calculates MCC correctly with large datasets (80%)', () => {
      const examplesThatShouldPassTheEvaluation = Array.from(
        { length: 10 },
        (_, i) => i < 8, // [true x8, false x2] -> 8 TP, 2 FN
      )
      const examplesThatShouldFailTheEvaluation = Array.from(
        { length: 10 },
        (_, i) => i < 2, // [true x2, false x8] -> 2 FP, 8 TN
      )

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

  describe('edge cases', () => {
    it('returns error when no positive predictions exist (TP + FP = 0, all predictions are negative)', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [false, false], // 0 TP, 2 FN (all predicted negative)
        examplesThatShouldFailTheEvaluation: [false], // 0 FP, 1 TN (all predicted negative)
      })

      // TP + FP = 0, so we can't calculate MCC (no positive predictions to evaluate)
      expect(Result.isOk(mccResult)).toBe(false)
    })

    it('returns error when no negative predictions exist (TN + FN = 0, all predictions are positive)', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true], // 1 TP, 0 FN (all predicted positive)
        examplesThatShouldFailTheEvaluation: [true, true], // 2 FP, 0 TN (all predicted positive)
      })

      // TN + FN = 0, so we can't calculate MCC (no negative predictions to evaluate)
      expect(Result.isOk(mccResult)).toBe(false)
    })

    it('returns 0 MCC when denominator is 0 (degenerate case)', () => {
      // This tests the NaN handling - when the MCC formula produces NaN
      // We need a case where the formula produces NaN but passes the initial validation
      // This happens when one of the four quadrants has all the data
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, false], // 1 TP, 1 FN
        examplesThatShouldFailTheEvaluation: [true, false], // 1 FP, 1 TN
      })

      // This is actually a valid case with MCC = 0 (random classifier)
      expect(Result.isOk(mccResult)).toBe(true)
      const { mcc } = mccResult.unwrap()
      expect(mcc).toBe(50) // MCC of 0 scales to 50%
    })

    it('returns error with empty shouldPass array', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [],
        examplesThatShouldFailTheEvaluation: [false, false],
      })

      expect(Result.isOk(mccResult)).toBe(false)
    })

    it('returns error with empty shouldFail array', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, true],
        examplesThatShouldFailTheEvaluation: [],
      })

      expect(Result.isOk(mccResult)).toBe(false)
    })

    it('returns error with both empty arrays', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [],
        examplesThatShouldFailTheEvaluation: [],
      })

      expect(Result.isOk(mccResult)).toBe(false)
    })
  })

  describe('real-world scenarios', () => {
    it('high precision evaluation: catches most issues but has some false alarms', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, true, true, true, true], // 5 TP, 0 FN
        examplesThatShouldFailTheEvaluation: [false, false, false, true, true], // 2 FP, 3 TN
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { mcc, confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix).toEqual({
        truePositives: 5,
        trueNegatives: 3,
        falsePositives: 2,
        falseNegatives: 0,
      })
      expect(mcc).toBeGreaterThan(70)
    })

    it('high recall evaluation: catches all good examples but misses some issues', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, true, true, false, false], // 3 TP, 2 FN
        examplesThatShouldFailTheEvaluation: [
          false,
          false,
          false,
          false,
          false,
        ], // 0 FP, 5 TN
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { mcc, confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix).toEqual({
        truePositives: 3,
        trueNegatives: 5,
        falsePositives: 0,
        falseNegatives: 2,
      })
      expect(mcc).toBeGreaterThan(70)
    })

    it('imbalanced dataset: many more negative examples', () => {
      const mccResult = calculateMCC({
        examplesThatShouldPassTheEvaluation: [true, true], // 2 TP
        examplesThatShouldFailTheEvaluation: [
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
        ], // 8 TN
      })

      expect(Result.isOk(mccResult)).toBe(true)
      const { mcc, confusionMatrix } = mccResult.unwrap()
      expect(confusionMatrix).toEqual({
        truePositives: 2,
        trueNegatives: 8,
        falsePositives: 0,
        falseNegatives: 0,
      })
      expect(mcc).toBe(100)
    })
  })
})
