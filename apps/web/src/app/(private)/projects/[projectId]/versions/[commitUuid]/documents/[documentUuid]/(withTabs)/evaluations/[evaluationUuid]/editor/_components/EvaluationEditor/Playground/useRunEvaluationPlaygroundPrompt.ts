import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { ROUTES } from '$/services/routes'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useCallback } from 'react'

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
  const {
    createStreamHandler,
    abortCurrentStream,
    hasActiveStream,
    createAbortController,
  } = useStreamHandler()
  const runPromptFn = useCallback(async () => {
    const route = ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commit.uuid)
      .documents.detail(document.documentUuid)
      .evaluations.detail(evaluation.uuid).runLlm.root

    const signal = createAbortController()

    const response = await fetch(route, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters }),
      signal: signal,
    })

    return createStreamHandler(response, signal)
  }, [
    parameters,
    projectId,
    commit.uuid,
    document.documentUuid,
    evaluation.uuid,
    createAbortController,
    createStreamHandler,
  ])

  return { runPromptFn, abortCurrentStream, hasActiveStream }
}
