import { useCallback, useEffect, useState } from 'react'

import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogWithMetadata from '$/stores/documentLogWithMetadata'
import { DocumentVersion } from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  COLLAPSED_BOX_HEIGHT,
  SplitPane,
  useCurrentCommit,
  useLocalStorage,
} from '@latitude-data/web-ui'
import type { ConversationMetadata } from 'promptl-ai'

import Chat from './Chat'
import DocumentEvaluations from './DocumentEvaluations'
import DocumentParams from './DocumentParams'
import Preview from './Preview'

const COLLAPSED_SIZE = COLLAPSED_BOX_HEIGHT * 2 + 12
const INITIAL_EXPANDED_SIZE = COLLAPSED_SIZE + 120
const GAP_PADDING = 26

export default function Playground({
  document,
  prompt,
  setPrompt,
  metadata,
}: {
  document: DocumentVersion
  prompt: string
  setPrompt: (prompt: string) => void
  metadata: ConversationMetadata
}) {
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()

  const [forcedSize, setForcedSize] = useState<number | undefined>()
  const [expandedParameters, setExpandedParameters] = useState(false)
  const [expandedEvaluations, setExpandedEvaluations] = useState(false)
  const collapsed = !expandedParameters && !expandedEvaluations
  useEffect(() => {
    setForcedSize(collapsed ? COLLAPSED_SIZE : INITIAL_EXPANDED_SIZE)
  }, [collapsed])

  const { parameters } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
  })

  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
      defaultValue: false,
    })

  const [runCount, setRunCount] = useState(0)
  const [documentLogUuid, setDocumentLogUuid] = useState<string | undefined>()
  const { data: documentLog, isLoading: isDocumentLogLoading } =
    useDocumentLogWithMetadata({
      documentLogUuid: documentLogUuid,
    })
  const onPromptRan = useCallback(
    (documentLogUuid?: string, error?: Error) => {
      if (!documentLogUuid || error) return
      setRunCount((prev) => prev + 1)
      setDocumentLogUuid(documentLogUuid)
    },
    [setRunCount, setDocumentLogUuid],
  )

  return (
    <SplitPane
      direction='vertical'
      gap={4}
      initialPercentage={1} // minSize ensures all boxes are visible when collapsed
      forcedSize={forcedSize}
      minSize={COLLAPSED_SIZE + GAP_PADDING}
      dragDisabled={collapsed}
      firstPane={
        <div className='flex flex-col gap-2 w-full pr-0.5'>
          <DocumentParams
            commit={commit}
            document={document}
            prompt={prompt}
            setPrompt={setPrompt}
            onExpand={setExpandedParameters}
          />
          <DocumentEvaluations
            documentLog={documentLog}
            commit={commit}
            document={document}
            runCount={runCount}
            onExpand={setExpandedEvaluations}
            isLoading={isDocumentLogLoading}
          />
        </div>
      }
      secondPane={
        <div className='h-full flex-grow flex-shrink min-h-0 flex flex-col gap-2 overflow-hidden pr-0.5'>
          {mode === 'preview' ? (
            <Preview
              metadata={metadata}
              parameters={parameters}
              runPrompt={() => setMode('chat')}
              expandParameters={expandParameters}
              setExpandParameters={setExpandParameters}
            />
          ) : (
            <Chat
              document={document}
              parameters={parameters}
              clearChat={() => setMode('preview')}
              onPromptRan={onPromptRan}
              expandParameters={expandParameters}
              setExpandParameters={setExpandParameters}
            />
          )}
        </div>
      }
    />
  )
}
