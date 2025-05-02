import { useCallback } from 'react'
import {
  Commit,
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { ROUTES } from '$/services/routes'

export function useRunEvaluationPlaygroundPrompt({
  projectId,
  commit,
  document,
  evaluation,
  parameters,
}: {
  projectId: number
  commit: Commit
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  parameters: Record<string, unknown> | undefined
}) {
  const { createStreamHandler } = useStreamHandler()
  const runPromptFn = useCallback(async () => {
    const route = ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commit.uuid)
      .documents.detail(document.documentUuid)
      .evaluationsV2.detail(evaluation.uuid).runLlm.root
    const response = await fetch(route, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters }),
    })

    return createStreamHandler(response)
  }, [
    parameters,
    createStreamHandler,
    projectId,
    commit.uuid,
    document.documentUuid,
    evaluation.uuid,
  ])

  return runPromptFn
}
