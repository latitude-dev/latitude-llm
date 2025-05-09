import { useMemo, useCallback } from 'react'
import { DocumentVersion, Project, Commit } from '@latitude-data/core/browser'
import { ROUTES } from '$/services/routes'
import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { OnboardingStep } from '$/app/(onboarding)/onboarding/_components/OnboardingClient'
import { DOCUMENT_PARAMETERS } from './constants'

const SECONDS_BEFORE_HIDING_PROMPT_IN_SECONDS = 2000

export function useRunOnboardingPrompt({
  project,
  commit,
  document,
  setCurrentStep,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  setCurrentStep: ReactStateDispatch<OnboardingStep>
}) {
  const { createStreamHandler, hasActiveStream } = useStreamHandler()
  const runDocument = useCallback(async () => {
    try {
      const response = await fetch(
        ROUTES.api.documents.detail(document.documentUuid).run,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: document.path,
            parameters: DOCUMENT_PARAMETERS,
            commitUuid: commit.uuid,
            projectId: project.id,
            stream: true,
          }),
        },
      )

      return createStreamHandler(response)
    } catch (error) {
      console.error('Error running prompt:', error)
      // Consider user-facing error handling here
      throw error
    }
  }, [document, createStreamHandler, project.id, commit.uuid])

  const {
    start,
    streamingResponse,
    streamingReasoning,
    messages,
    chainLength,
  } = usePlaygroundChat({
    runPromptFn: () => {
      return runDocument()
    },
    onPromptRan: () => {
      setTimeout(() => {
        setCurrentStep(OnboardingStep.ShowResultsAndExperiment)
      }, SECONDS_BEFORE_HIDING_PROMPT_IN_SECONDS)
    },
  })

  const activeStream = hasActiveStream()
  return useMemo(
    () => ({
      start,
      streamingResponse,
      streamingReasoning,
      messages,
      chainLength,
      activeStream,
    }),
    [
      start,
      streamingResponse,
      streamingReasoning,
      messages,
      chainLength,
      activeStream,
    ],
  )
}
