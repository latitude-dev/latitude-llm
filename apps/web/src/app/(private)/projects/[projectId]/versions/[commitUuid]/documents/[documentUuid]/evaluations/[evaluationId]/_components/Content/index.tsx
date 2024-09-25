'use client'

import {
  Commit,
  EvaluationAggregationTotals,
  EvaluationDto,
  EvaluationMeanValue,
  EvaluationModalValue,
} from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'

import { EvaluationResults } from '../EvaluationResults'
import { MetricsSummary } from '../MetricsSummary'
import { useEvaluationStatus } from './useEvaluationStatus'

export default function Content<T extends boolean>({
  commit,
  evaluation,
  evaluationResults,
  documentUuid,
  aggregationTotals,
  isNumeric,
  meanOrModal,
}: {
  commit: Commit
  evaluation: EvaluationDto
  documentUuid: string
  evaluationResults: EvaluationResultWithMetadata[]
  aggregationTotals: EvaluationAggregationTotals
  isNumeric: T
  meanOrModal: T extends true ? EvaluationMeanValue : EvaluationModalValue
}) {
  const { jobs } = useEvaluationStatus({ evaluation })
  return (
    <>
      <MetricsSummary
        commit={commit}
        evaluation={evaluation}
        documentUuid={documentUuid}
        aggregationTotals={aggregationTotals}
        isNumeric={isNumeric}
        meanOrModal={meanOrModal}
      />
      <EvaluationResults
        evaluation={evaluation}
        evaluationResults={evaluationResults}
        jobs={jobs}
      />
    </>
  )
}
