'use client'

import { useEffect } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import useEvaluationResultsWithMetadata from '$/stores/evaluationResultsWithMetadata'

import { EvaluationResults } from '../EvaluationResults'
import { MetricsSummary } from '../MetricsSummary'

const FIVE_SECONDS = 5000

export default function ClientContainer({
  documentUuid,
  evaluation,
  evaluationResults: serverData,
}: {
  documentUuid: string
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultWithMetadata[]
}) {
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: evaluationResults, mutate } = useEvaluationResultsWithMetadata(
    {
      evaluationId: evaluation.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
    },
    {
      fallbackData: serverData,
    },
  )

  useEffect(() => {
    const interval = setInterval(() => {
      mutate()
    }, FIVE_SECONDS)

    return () => clearInterval(interval)
  }, [mutate])

  return (
    <>
      <MetricsSummary
        documentUuid={documentUuid}
        evaluation={evaluation}
        evaluationResults={evaluationResults}
      />
      <EvaluationResults
        evaluation={evaluation}
        evaluationResults={evaluationResults}
      />
    </>
  )
}
