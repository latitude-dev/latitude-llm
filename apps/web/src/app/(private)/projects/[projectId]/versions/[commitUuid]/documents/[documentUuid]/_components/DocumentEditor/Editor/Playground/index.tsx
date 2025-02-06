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
import { DocumentParams } from './DocumentParams'
import Evaluations from './Evaluations'
import Preview from './Preview'

const COLLAPSED_SIZE = COLLAPSED_BOX_HEIGHT * 2 + 12
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
  const promptlVersion = document.promptlVersion === 1 ? 1 : 0
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()

  const [forcedSize, setForcedSize] = useState<number | undefined>()
  const [expandedParameters, setExpandedParameters] = useState(false)
  const [expandedEvaluations, setExpandedEvaluations] = useState(false)
  const collapsed = !expandedParameters && !expandedEvaluations
  useEffect(() => {
    setForcedSize(collapsed ? COLLAPSED_SIZE : undefined)
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

  const [documentLogUuid, setDocumentLogUuid] = useState<string | undefined>()
  const { data: documentLog } = useDocumentLogWithMetadata({
    documentLogUuid: documentLogUuid,
  })
  const onPromptRan = useCallback(
    (documentLogUuid: string) => setDocumentLogUuid(documentLogUuid),
    [setDocumentLogUuid],
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
          <Evaluations
            log={documentLog}
            commit={commit}
            document={document}
            onExpand={setExpandedEvaluations}
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
              promptlVersion={promptlVersion}
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
