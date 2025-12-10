import { Result } from '@latitude-data/core/lib/Result'
import { describe, expect, it, vi } from 'vitest'
import * as calculateMCCModule from './calculateMCC'
import { evaluateConfiguration } from './evaluateConfiguration'

/**
 * evaluateConfiguration takes evaluation results and ground truth pairs,
 * sorts them into "should pass" and "should fail" categories,
 * then calculates the MCC.
 *
 * The sorting logic groups hasPassed booleans by their ground truth category:
 * - If a span/trace pair is in "shouldPass" list, its hasPassed value goes to examplesThatShouldPassTheEvaluation
 * - If a span/trace pair is in "shouldFail" list, its hasPassed value goes to examplesThatShouldFailTheEvaluation
 */

describe('evaluateConfiguration', () => {
  describe('sorting evaluation results by ground truth', () => {
    it('correctly groups hasPassed values by ground truth category', async () => {
      const calculateMCCSpy = vi.spyOn(calculateMCCModule, 'calculateMCC')
      calculateMCCSpy.mockReturnValue(
        Result.ok({
          mcc: 75,
          confusionMatrix: {
            truePositives: 2,
            trueNegatives: 2,
            falsePositives: 1,
            falseNegatives: 1,
          },
        }),
      )

      await evaluateConfiguration({
        childrenValues: {
          'job-good-1': {
            hasPassed: true,
            evaluatedSpanId: 'good-1',
            evaluatedTraceId: 'trace-good-1',
          },
          'job-good-2': {
            hasPassed: false,
            evaluatedSpanId: 'good-2',
            evaluatedTraceId: 'trace-good-2',
          },
          'job-bad-1': {
            hasPassed: false,
            evaluatedSpanId: 'bad-1',
            evaluatedTraceId: 'trace-bad-1',
          },
          'job-bad-2': {
            hasPassed: true,
            evaluatedSpanId: 'bad-2',
            evaluatedTraceId: 'trace-bad-2',
          },
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { spanId: 'good-1', traceId: 'trace-good-1' },
          { spanId: 'good-2', traceId: 'trace-good-2' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { spanId: 'bad-1', traceId: 'trace-bad-1' },
          { spanId: 'bad-2', traceId: 'trace-bad-2' },
        ],
      })

      expect(calculateMCCSpy).toHaveBeenCalledWith({
        examplesThatShouldPassTheEvaluation: [true, false], // good-1: true, good-2: false
        examplesThatShouldFailTheEvaluation: [false, true], // bad-1: false, bad-2: true
      })

      calculateMCCSpy.mockRestore()
    })

    it('ignores evaluation results not matching any ground truth pair', async () => {
      const calculateMCCSpy = vi.spyOn(calculateMCCModule, 'calculateMCC')
      calculateMCCSpy.mockReturnValue(
        Result.ok({
          mcc: 100,
          confusionMatrix: {
            truePositives: 1,
            trueNegatives: 1,
            falsePositives: 0,
            falseNegatives: 0,
          },
        }),
      )

      await evaluateConfiguration({
        childrenValues: {
          'job-good': {
            hasPassed: true,
            evaluatedSpanId: 'good',
            evaluatedTraceId: 'trace-good',
          },
          'job-bad': {
            hasPassed: false,
            evaluatedSpanId: 'bad',
            evaluatedTraceId: 'trace-bad',
          },
          'job-unknown': {
            hasPassed: true,
            evaluatedSpanId: 'unknown',
            evaluatedTraceId: 'trace-unknown',
          },
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { spanId: 'good', traceId: 'trace-good' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { spanId: 'bad', traceId: 'trace-bad' },
        ],
      })

      expect(calculateMCCSpy).toHaveBeenCalledWith({
        examplesThatShouldPassTheEvaluation: [true], // Only 'good' matched
        examplesThatShouldFailTheEvaluation: [false], // Only 'bad' matched
      })

      calculateMCCSpy.mockRestore()
    })

    it('requires both spanId AND traceId to match', async () => {
      const calculateMCCSpy = vi.spyOn(calculateMCCModule, 'calculateMCC')
      calculateMCCSpy.mockReturnValue(
        Result.ok({
          mcc: 100,
          confusionMatrix: {
            truePositives: 1,
            trueNegatives: 1,
            falsePositives: 0,
            falseNegatives: 0,
          },
        }),
      )

      await evaluateConfiguration({
        childrenValues: {
          'job-partial-match-1': {
            hasPassed: true,
            evaluatedSpanId: 'span-1',
            evaluatedTraceId: 'different-trace', // Different trace
          },
          'job-partial-match-2': {
            hasPassed: true,
            evaluatedSpanId: 'different-span', // Different span
            evaluatedTraceId: 'trace-1',
          },
          'job-exact-match': {
            hasPassed: true,
            evaluatedSpanId: 'span-exact',
            evaluatedTraceId: 'trace-exact',
          },
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { spanId: 'span-1', traceId: 'trace-1' }, // Won't match partial matches
          { spanId: 'span-exact', traceId: 'trace-exact' }, // Will match
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { spanId: 'bad', traceId: 'trace-bad' },
        ],
      })

      expect(calculateMCCSpy).toHaveBeenCalledWith({
        examplesThatShouldPassTheEvaluation: [true], // Only exact match
        examplesThatShouldFailTheEvaluation: [],
      })

      calculateMCCSpy.mockRestore()
    })
  })

  describe('integration with calculateMCC', () => {
    it('returns MCC and confusion matrix from calculateMCC', async () => {
      const result = await evaluateConfiguration({
        childrenValues: {
          'job-1': {
            hasPassed: true,
            evaluatedSpanId: 'good-1',
            evaluatedTraceId: 'trace-1',
          },
          'job-2': {
            hasPassed: true,
            evaluatedSpanId: 'good-2',
            evaluatedTraceId: 'trace-2',
          },
          'job-3': {
            hasPassed: false,
            evaluatedSpanId: 'bad-1',
            evaluatedTraceId: 'trace-3',
          },
          'job-4': {
            hasPassed: false,
            evaluatedSpanId: 'bad-2',
            evaluatedTraceId: 'trace-4',
          },
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { spanId: 'good-1', traceId: 'trace-1' },
          { spanId: 'good-2', traceId: 'trace-2' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { spanId: 'bad-1', traceId: 'trace-3' },
          { spanId: 'bad-2', traceId: 'trace-4' },
        ],
      })

      expect(Result.isOk(result)).toBe(true)
      const { mcc, confusionMatrix } = result.unwrap()
      expect(mcc).toBe(100)
      expect(confusionMatrix).toEqual({
        truePositives: 2,
        trueNegatives: 2,
        falsePositives: 0,
        falseNegatives: 0,
      })
    })

    it('propagates error from calculateMCC when validation fails', async () => {
      const result = await evaluateConfiguration({
        childrenValues: {
          'job-1': {
            hasPassed: false, // No positive predictions
            evaluatedSpanId: 'span-1',
            evaluatedTraceId: 'trace-1',
          },
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { spanId: 'span-1', traceId: 'trace-1' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { spanId: 'span-2', traceId: 'trace-2' },
        ],
      })

      expect(Result.isOk(result)).toBe(false)
    })
  })

  describe('real-world scenario: evaluation alignment check', () => {
    it('calculates alignment for an evaluation that mostly agrees with human judgment', async () => {
      const result = await evaluateConfiguration({
        childrenValues: {
          'good-1': {
            hasPassed: true,
            evaluatedSpanId: 'g1',
            evaluatedTraceId: 't1',
          },
          'good-2': {
            hasPassed: true,
            evaluatedSpanId: 'g2',
            evaluatedTraceId: 't2',
          },
          'good-3': {
            hasPassed: true,
            evaluatedSpanId: 'g3',
            evaluatedTraceId: 't3',
          },
          'good-4': {
            hasPassed: false,
            evaluatedSpanId: 'g4',
            evaluatedTraceId: 't4',
          }, // FN - disagreement
          'bad-1': {
            hasPassed: false,
            evaluatedSpanId: 'b1',
            evaluatedTraceId: 't5',
          },
          'bad-2': {
            hasPassed: false,
            evaluatedSpanId: 'b2',
            evaluatedTraceId: 't6',
          },
          'bad-3': {
            hasPassed: false,
            evaluatedSpanId: 'b3',
            evaluatedTraceId: 't7',
          },
          'bad-4': {
            hasPassed: true,
            evaluatedSpanId: 'b4',
            evaluatedTraceId: 't8',
          }, // FP - disagreement
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { spanId: 'g1', traceId: 't1' },
          { spanId: 'g2', traceId: 't2' },
          { spanId: 'g3', traceId: 't3' },
          { spanId: 'g4', traceId: 't4' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { spanId: 'b1', traceId: 't5' },
          { spanId: 'b2', traceId: 't6' },
          { spanId: 'b3', traceId: 't7' },
          { spanId: 'b4', traceId: 't8' },
        ],
      })

      expect(Result.isOk(result)).toBe(true)
      const { mcc, confusionMatrix } = result.unwrap()
      expect(confusionMatrix).toEqual({
        truePositives: 3,
        trueNegatives: 3,
        falsePositives: 1,
        falseNegatives: 1,
      })
      expect(mcc).toBeGreaterThan(70) // 75% alignment is good
    })
  })
})
