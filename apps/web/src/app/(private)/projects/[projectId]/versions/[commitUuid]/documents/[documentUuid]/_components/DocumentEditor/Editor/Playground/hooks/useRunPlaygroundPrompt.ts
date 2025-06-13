import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { Message as ConversationMessage } from '@latitude-data/constants'
import { ROUTES } from '$/services/routes'
import { DocumentVersion } from '@latitude-data/core/browser'
import { useCallback, useMemo } from 'react'
import { ICommitContextType } from '@latitude-data/web-ui/providers'

export function useRunPlaygroundPrompt({
  commit,
  projectId,
  document,
  parameters,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  projectId: number
  parameters: Record<string, unknown> | undefined
}) {
  const { createStreamHandler, abortCurrentStream, hasActiveStream } =
    useStreamHandler()
  const runPromptFn = useCallback(async () => {
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
          projectId: projectId,
          commitUuid: commit.uuid,
          parameters: parameters ?? {},
          stream: true, // Explicitly request streaming
        }),
      },
    )

    return createStreamHandler(response)
  }, [
    projectId,
    document.path,
    document.documentUuid,
    commit.uuid,
    parameters,
    createStreamHandler,
  ])

  const addMessagesFn = useCallback(
    async ({
      documentLogUuid,
      messages,
    }: {
      documentLogUuid: string
      messages: ConversationMessage[]
    }) => {
      const response = await fetch(
        ROUTES.api.documents.logs.detail(documentLogUuid).chat,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
          }),
        },
      )

      return createStreamHandler(response)
    },
    [createStreamHandler],
  )

  return useMemo(
    () => ({ runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream }),
    [runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream],
  )
}
