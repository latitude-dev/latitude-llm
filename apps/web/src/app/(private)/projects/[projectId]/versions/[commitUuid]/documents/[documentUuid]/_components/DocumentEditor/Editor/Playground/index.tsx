import { useCallback, useEffect, useState } from 'react'

import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogWithMetadata from '$/stores/documentLogWithMetadata'
import { DatasetVersion, DocumentVersion } from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { cn } from '@latitude-data/web-ui/utils'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { COLLAPSED_BOX_HEIGHT } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import type { ConversationMetadata } from 'promptl-ai'

import Chat from './Chat'
import DocumentEvaluations from './DocumentEvaluations'
import DocumentParams from './DocumentParams'
import Preview from './Preview'
import DocumentParamsLoading from './DocumentParams/DocumentParamsLoading'
import { useExpandParametersOrEvaluations } from './hooks/useExpandParametersOrEvaluations'

const COLLAPSED_SIZE = COLLAPSED_BOX_HEIGHT * 2 + 12
const GAP_PADDING = 26

export default function Playground({
  document,
  prompt,
  setPrompt,
  metadata,
  datasetVersion,
}: {
  document: DocumentVersion
  prompt: string
  setPrompt: (prompt: string) => void
  metadata: ConversationMetadata
  datasetVersion: DatasetVersion
}) {
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()
  const [forcedSize, setForcedSize] = useState<number | undefined>()
  const expander = useExpandParametersOrEvaluations({
    initialExpanded: 'parameters',
  })
  const collapsed = expander.expandedSection === null
  useEffect(() => {
    setForcedSize(collapsed ? COLLAPSED_SIZE : undefined)
  }, [collapsed])
  const { parameters, source, setSource } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
    datasetVersion,
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
      initialPercentage={50}
      forcedSize={forcedSize}
      minSize={COLLAPSED_SIZE + GAP_PADDING}
      dragDisabled={collapsed}
      firstPane={
        <div className={cn('grid gap-2 w-full pr-0.5', expander.cssClass)}>
          {!parameters ? (
            <DocumentParamsLoading source={source} />
          ) : (
            <DocumentParams
              commit={commit}
              document={document}
              prompt={prompt}
              source={source}
              setSource={setSource}
              setPrompt={setPrompt}
              onToggle={expander.onToggle('parameters')}
              isExpanded={expander.parametersExpanded}
              datasetVersion={datasetVersion}
            />
          )}
          <DocumentEvaluations
            documentLog={documentLog}
            commit={commit}
            document={document}
            runCount={runCount}
            isExpanded={expander.evaluationsExpanded}
            onToggle={expander.onToggle('evaluations')}
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
