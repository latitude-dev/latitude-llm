import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import type {
  Message as ConversationMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { ROUTES } from '$/services/routes'
import type { DocumentVersion, TraceContext } from '@latitude-data/core/browser'
import type { ICommitContextType } from '@latitude-data/web-ui/providers'
import { useCallback, useMemo } from 'react'

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
  const { createStreamHandler, abortCurrentStream, hasActiveStream } = useStreamHandler()
  const runPromptFn = useCallback(async () => {
    const response = await fetch(ROUTES.api.documents.detail(document.documentUuid).run, {
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
    })

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
      toolCalls,
      trace,
    }: {
      documentLogUuid: string
      messages: ConversationMessage[]
      toolCalls?: ToolCall[]
      trace?: TraceContext
    }) => {
      const response = await fetch(ROUTES.api.documents.logs.detail(documentLogUuid).chat, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages, toolCalls, trace }),
      })

      return createStreamHandler(response)
    },
    [createStreamHandler],
  )

  return useMemo(
    () => ({ runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream }),
    [runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream],
  )
}
