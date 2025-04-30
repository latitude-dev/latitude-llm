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
    // TODO: Implement action for running evaluation prompt
    const response = await fetch(ROUTES.api.documents.detail('foo-bar').run, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
        parameters: parameters,
      }),
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
