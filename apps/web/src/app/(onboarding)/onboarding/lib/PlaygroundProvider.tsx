import { createContext, useContext, useCallback, ReactNode } from 'react'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { useRunDocument } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/hooks/useRunDocument'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { DocumentVersion } from '@latitude-data/core/schema/types'

interface IPlaygroundContextType {
  playground: ReturnType<typeof usePlaygroundChat>
  addMessages: ReturnType<typeof useRunDocument>['addMessages']
  hasActiveStream: ReturnType<typeof useRunDocument>['hasActiveStream']
  runDocument: ReturnType<typeof useRunDocument>['runDocument']
}

const PlaygroundContext = createContext<IPlaygroundContextType>(
  {} as IPlaygroundContextType,
)

const PlaygroundProvider = ({ children }: { children: ReactNode }) => {
  const commit = useCurrentCommit()

  const { runDocument, addMessages, hasActiveStream } = useRunDocument({
    commit: commit.commit,
  })

  const runPromptFn = useCallback(
    ({
      document,
      userMessage,
      parameters = {},
      aiParameters = true,
    }: {
      document: DocumentVersion
      parameters: Record<string, unknown>
      userMessage: string | undefined
      aiParameters: boolean
    }) =>
      runDocument({
        document,
        parameters,
        userMessage,
        aiParameters,
      }),
    [runDocument],
  )

  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn: addMessages,
    onPromptRan: (documentLogUuid, error) => {
      if (!documentLogUuid || error) return
    },
  })

  return (
    <PlaygroundContext.Provider
      value={{ playground, addMessages, hasActiveStream, runDocument }}
    >
      {children}
    </PlaygroundContext.Provider>
  )
}

const usePlayground = () => {
  const context = useContext(PlaygroundContext)
  if (!context) {
    throw new Error('usePlayground must be used within a PlaygroundProvider')
  }
  return context
}

export { PlaygroundProvider, usePlayground }
