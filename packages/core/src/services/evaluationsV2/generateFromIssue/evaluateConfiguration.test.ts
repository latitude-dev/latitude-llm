import { Result } from '@latitude-data/core/lib/Result'
import { describe, expect, it, vi } from 'vitest'
import * as calculateMCCModule from './calculateMCC'
import { evaluateConfiguration } from './evaluateConfiguration'
import { SerializedSpanPair } from '../../../jobs/job-definitions/evaluations/validateGeneratedEvaluationJob'

const createPair = (
  spanId: string,
  traceId: string,
  createdAt?: string,
): SerializedSpanPair => ({
  id: spanId,
  traceId,
  createdAt: createdAt ?? new Date().toISOString(),
})

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
          createPair('good-1', 'trace-good-1'),
          createPair('good-2', 'trace-good-2'),
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          createPair('bad-1', 'trace-bad-1'),
          createPair('bad-2', 'trace-bad-2'),
        ],
      })

      expect(calculateMCCSpy).toHaveBeenCalledWith({
        examplesThatShouldPassTheEvaluation: [true, false], // good-1: true, good-2: false
        examplesThatShouldFailTheEvaluation: [false, true], // bad-1: false, bad-2: true
        alreadyCalculatedAlignmentMetricMetadata: undefined,
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
          createPair('good', 'trace-good'),
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          createPair('bad', 'trace-bad'),
        ],
      })

      expect(calculateMCCSpy).toHaveBeenCalledWith({
        examplesThatShouldPassTheEvaluation: [true], // Only 'good' matched
        examplesThatShouldFailTheEvaluation: [false], // Only 'bad' matched
        alreadyCalculatedAlignmentMetricMetadata: undefined,
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
          createPair('span-1', 'trace-1'), // Won't match partial matches
          createPair('span-exact', 'trace-exact'), // Will match
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          createPair('bad', 'trace-bad'),
        ],
      })

      // Rebalancing: 1 positive matched, 0 negative matched -> both sliced to 0
      expect(calculateMCCSpy).toHaveBeenCalledWith({
        examplesThatShouldPassTheEvaluation: [], // Sliced to match negative count (0)
        examplesThatShouldFailTheEvaluation: [],
        alreadyCalculatedAlignmentMetricMetadata: undefined,
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
          createPair('good-1', 'trace-1'),
          createPair('good-2', 'trace-2'),
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          createPair('bad-1', 'trace-3'),
          createPair('bad-2', 'trace-4'),
        ],
      })

      expect(Result.isOk(result)).toBe(true)
      const {
        mcc,
        confusionMatrix,
        latestPositiveSpanDate,
        latestNegativeSpanDate,
      } = result.unwrap()
      expect(latestPositiveSpanDate).toBeDefined()
      expect(latestNegativeSpanDate).toBeDefined()
      expect(mcc).toBe(100)
      expect(confusionMatrix).toEqual({
        truePositives: 2,
        trueNegatives: 2,
        falsePositives: 0,
        falseNegatives: 0,
      })
    })
  })

  describe('incremental updates with existing metadata', () => {
    it('combines new results with existing confusion matrix when alreadyCalculatedAlignmentMetricMetadata is provided', async () => {
      const calculateMCCSpy = vi.spyOn(calculateMCCModule, 'calculateMCC')
      calculateMCCSpy.mockReturnValue(
        Result.ok({
          mcc: 80,
          confusionMatrix: {
            truePositives: 5, // 2 new + 3 existing
            trueNegatives: 5, // 2 new + 3 existing
            falsePositives: 1, // 0 new + 1 existing
            falseNegatives: 1, // 0 new + 1 existing
          },
        }),
      )

      const existingMetadata = {
        confusionMatrix: {
          truePositives: 3,
          trueNegatives: 3,
          falsePositives: 1,
          falseNegatives: 1,
        },
        alignmentHash: 'existing-hash-123',
        lastProcessedPositiveSpanDate: new Date('2024-01-01T00:00:00.000Z'),
        lastProcessedNegativeSpanDate: new Date('2024-01-01T00:00:00.000Z'),
      }

      await evaluateConfiguration({
        childrenValues: {
          'job-good-1': {
            hasPassed: true,
            evaluatedSpanId: 'good-1',
            evaluatedTraceId: 'trace-good-1',
          },
          'job-good-2': {
            hasPassed: true,
            evaluatedSpanId: 'good-2',
            evaluatedTraceId: 'trace-good-2',
          },
          'job-bad-1': {
            hasPassed: false,
            evaluatedSpanId: 'bad-1',
            evaluatedTraceId: 'trace-bad-1',
          },
          'job-bad-2': {
            hasPassed: false,
            evaluatedSpanId: 'bad-2',
            evaluatedTraceId: 'trace-bad-2',
          },
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          createPair('good-1', 'trace-good-1', '2024-06-01T12:00:00.000Z'),
          createPair('good-2', 'trace-good-2', '2024-06-02T12:00:00.000Z'),
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          createPair('bad-1', 'trace-bad-1', '2024-06-01T14:00:00.000Z'),
          createPair('bad-2', 'trace-bad-2', '2024-06-02T14:00:00.000Z'),
        ],
        alreadyCalculatedAlignmentMetricMetadata: existingMetadata,
      })

      expect(calculateMCCSpy).toHaveBeenCalledWith({
        examplesThatShouldPassTheEvaluation: [true, true],
        examplesThatShouldFailTheEvaluation: [false, false],
        alreadyCalculatedAlignmentMetricMetadata: existingMetadata,
      })

      calculateMCCSpy.mockRestore()
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
          createPair('g1', 't1'),
          createPair('g2', 't2'),
          createPair('g3', 't3'),
          createPair('g4', 't4'),
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          createPair('b1', 't5'),
          createPair('b2', 't6'),
          createPair('b3', 't7'),
          createPair('b4', 't8'),
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
