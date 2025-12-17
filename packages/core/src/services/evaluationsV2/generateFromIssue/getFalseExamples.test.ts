import { Result } from '@latitude-data/core/lib/Result'
import { describe, expect, it } from 'vitest'
import { getFalsePositivesAndFalseNegatives } from './getFalseExamples'

/**
 * Confusion Matrix Terminology:
 *
 * In the context of evaluation alignment:
 * - "Positive" prediction = evaluation passed (hasPassed = true) = span is GOOD (no issue)
 * - "Negative" prediction = evaluation failed (hasPassed = false) = span has ISSUE
 *
 * Ground truth:
 * - "Should pass" = span is actually GOOD (no issue) = Actually Positive
 * - "Should fail" = span actually HAS the issue = Actually Negative
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
 * False Positive (FP): Should FAIL but evaluation PASSED
 *   - The span HAS an issue, but the evaluation said it was good
 *
 * False Negative (FN): Should PASS but evaluation FAILED
 *   - The span is GOOD, but the evaluation said it had an issue
 */

describe('getFalsePositivesAndFalseNegatives', () => {
  const makeEvaluationResult = (
    spanId: string,
    traceId: string,
    hasPassed: boolean,
  ) => ({
    hasPassed,
    evaluatedSpanId: spanId,
    evaluatedTraceId: traceId,
  })

  describe('correctly identifies False Negatives', () => {
    it('returns FN when span should pass but evaluation did not pass', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { id: 'span-1', traceId: 'trace-1' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [],
        evaluationResults: {
          'job-1': makeEvaluationResult('span-1', 'trace-1', false), // Should pass but didn't
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falseNegatives).toEqual([{ spanId: 'span-1', traceId: 'trace-1' }])
      expect(falsePositives).toEqual([])
    })

    it('does not return FN when span should pass and evaluation did pass', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { id: 'span-1', traceId: 'trace-1' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [],
        evaluationResults: {
          'job-1': makeEvaluationResult('span-1', 'trace-1', true), // Correct: should pass and did pass (TP)
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falseNegatives).toEqual([])
      expect(falsePositives).toEqual([])
    })
  })

  describe('correctly identifies False Positives', () => {
    it('returns FP when span should fail but evaluation passed', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { id: 'span-2', traceId: 'trace-2' },
        ],
        evaluationResults: {
          'job-1': makeEvaluationResult('span-2', 'trace-2', true), // Should fail but passed
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falsePositives).toEqual([{ spanId: 'span-2', traceId: 'trace-2' }])
      expect(falseNegatives).toEqual([])
    })

    it('does not return FP when span should fail and evaluation did fail', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { id: 'span-2', traceId: 'trace-2' },
        ],
        evaluationResults: {
          'job-1': makeEvaluationResult('span-2', 'trace-2', false), // Correct: should fail and did fail (TN)
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falsePositives).toEqual([])
      expect(falseNegatives).toEqual([])
    })
  })

  describe('handles mixed scenarios', () => {
    it('correctly categorizes multiple results with both FP and FN', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { id: 'good-1', traceId: 'trace-good-1' },
          { id: 'good-2', traceId: 'trace-good-2' },
          { id: 'good-3', traceId: 'trace-good-3' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { id: 'bad-1', traceId: 'trace-bad-1' },
          { id: 'bad-2', traceId: 'trace-bad-2' },
          { id: 'bad-3', traceId: 'trace-bad-3' },
        ],
        evaluationResults: {
          'job-good-1': makeEvaluationResult('good-1', 'trace-good-1', true), // TP - correct
          'job-good-2': makeEvaluationResult('good-2', 'trace-good-2', false), // FN - wrong
          'job-good-3': makeEvaluationResult('good-3', 'trace-good-3', true), // TP - correct
          'job-bad-1': makeEvaluationResult('bad-1', 'trace-bad-1', false), // TN - correct
          'job-bad-2': makeEvaluationResult('bad-2', 'trace-bad-2', true), // FP - wrong
          'job-bad-3': makeEvaluationResult('bad-3', 'trace-bad-3', true), // FP - wrong
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()

      expect(falseNegatives).toEqual([
        { spanId: 'good-2', traceId: 'trace-good-2' },
      ])
      expect(falsePositives).toEqual([
        { spanId: 'bad-2', traceId: 'trace-bad-2' },
        { spanId: 'bad-3', traceId: 'trace-bad-3' },
      ])
    })

    it('returns empty arrays when all predictions are correct', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { id: 'good-1', traceId: 'trace-1' },
          { id: 'good-2', traceId: 'trace-2' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { id: 'bad-1', traceId: 'trace-3' },
          { id: 'bad-2', traceId: 'trace-4' },
        ],
        evaluationResults: {
          'job-1': makeEvaluationResult('good-1', 'trace-1', true), // TP
          'job-2': makeEvaluationResult('good-2', 'trace-2', true), // TP
          'job-3': makeEvaluationResult('bad-1', 'trace-3', false), // TN
          'job-4': makeEvaluationResult('bad-2', 'trace-4', false), // TN
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falsePositives).toEqual([])
      expect(falseNegatives).toEqual([])
    })

    it('returns all as errors when all predictions are wrong', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { id: 'good-1', traceId: 'trace-1' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { id: 'bad-1', traceId: 'trace-2' },
        ],
        evaluationResults: {
          'job-1': makeEvaluationResult('good-1', 'trace-1', false), // FN - should pass but didn't
          'job-2': makeEvaluationResult('bad-1', 'trace-2', true), // FP - should fail but passed
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falseNegatives).toEqual([{ spanId: 'good-1', traceId: 'trace-1' }])
      expect(falsePositives).toEqual([{ spanId: 'bad-1', traceId: 'trace-2' }])
    })
  })

  describe('edge cases', () => {
    it('handles empty inputs', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [],
        evaluationResults: {},
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falsePositives).toEqual([])
      expect(falseNegatives).toEqual([])
    })

    it('ignores evaluation results that do not match any ground truth pair', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { id: 'span-1', traceId: 'trace-1' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { id: 'span-2', traceId: 'trace-2' },
        ],
        evaluationResults: {
          'job-1': makeEvaluationResult('unknown-span', 'unknown-trace', false),
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falsePositives).toEqual([])
      expect(falseNegatives).toEqual([])
    })

    it('matches by both id AND traceId', () => {
      const result = getFalsePositivesAndFalseNegatives({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { id: 'span-1', traceId: 'trace-A' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [],
        evaluationResults: {
          'job-1': makeEvaluationResult('span-1', 'trace-B', false), // Same id but different traceId
        },
      })

      expect(Result.isOk(result)).toBe(true)
      const { falsePositives, falseNegatives } = result.unwrap()
      expect(falseNegatives).toEqual([]) // Should not match because traceId is different
      expect(falsePositives).toEqual([])
    })
  })
})
