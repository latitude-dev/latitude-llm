import { memo, useCallback, useEffect, useState } from 'react'

import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogWithMetadata from '$/stores/documentLogWithMetadata'
import { DocumentVersion } from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import type { ConversationMetadata } from 'promptl-ai'

import Chat from '$/components/PlaygroundCommon/Chat'
import {
  DOCUMENT_PLAYGROUND_COLLAPSED_SIZE,
  DOCUMENT_PLAYGROUND_GAP_PADDING,
} from '$/hooks/playgrounds/constants'
import { useExpandParametersOrEvaluations } from '$/hooks/playgrounds/useExpandParametersOrEvaluations'
import DocumentEvaluations from './DocumentEvaluations'
import DocumentParams from './DocumentParams'
import DocumentParamsLoading from './DocumentParams/DocumentParamsLoading'
import { useRunPlaygroundPrompt } from './hooks/useRunPlaygroundPrompt'
import Preview from './Preview'

export const Playground = memo(
  ({
    document,
    prompt,
    setPrompt,
    metadata,
  }: {
    document: DocumentVersion
    prompt: string
    setPrompt: (prompt: string) => void
    metadata: ConversationMetadata
  }) => {
    const [mode, setMode] = useState<'preview' | 'chat'>('preview')
    const { commit } = useCurrentCommit()
    const { project } = useCurrentProject()
    const [forcedSize, setForcedSize] = useState<number | undefined>()
    const expander = useExpandParametersOrEvaluations({
      initialExpanded: 'parameters',
    })
    const collapsed = expander.expandedSection === null
    useEffect(() => {
      setForcedSize(collapsed ? DOCUMENT_PLAYGROUND_COLLAPSED_SIZE : undefined)
    }, [collapsed])
    const { parameters, source, setSource } = useDocumentParameters({
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
    const clearChat = useCallback(() => setMode('preview'), [setMode])
    const runPrompt = useCallback(() => setMode('chat'), [setMode])
    const { runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream } =
      useRunPlaygroundPrompt({
        commit,
        projectId: project.id,
        document,
        parameters,
      })

    return (
      <SplitPane
        direction='vertical'
        gap={4}
        initialPercentage={50}
        forcedSize={forcedSize}
        minSize={
          DOCUMENT_PLAYGROUND_COLLAPSED_SIZE + DOCUMENT_PLAYGROUND_GAP_PADDING
        }
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
                runPrompt={runPrompt}
                expandParameters={expandParameters}
                setExpandParameters={setExpandParameters}
              />
            ) : (
              <Chat
                canChat
                parameters={parameters}
                clearChat={clearChat}
                abortCurrentStream={abortCurrentStream}
                hasActiveStream={hasActiveStream}
                runPromptFn={runPromptFn}
                addMessagesFn={addMessagesFn}
                onPromptRan={onPromptRan}
                expandParameters={expandParameters}
                setExpandParameters={setExpandParameters}
              />
            )}
          </div>
        }
      />
    )
  },
)
