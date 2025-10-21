import { memo, useCallback, useState } from 'react'

import Actions from '$/components/PlaygroundCommon/Actions'
import Chat from '$/components/PlaygroundCommon/Chat'
import { useExpandParametersOrEvaluations } from '$/hooks/playgrounds/useExpandParametersOrEvaluations'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogWithMetadata from '$/stores/documentLogWithMetadata'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { cn } from '@latitude-data/web-ui/utils'
import DocumentEvaluations from './DocumentEvaluations'
import DocumentParams from './DocumentParams'
import DocumentParamsLoading from './DocumentParams/DocumentParamsLoading'
import { useRunPlaygroundPrompt } from './hooks/useRunPlaygroundPrompt'
import Preview from './Preview'

import { LogSources } from '@latitude-data/core/constants'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
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
    metadata: ResolvedMetadata
  }) => {
    const [mode, setMode] = useState<'preview' | 'chat'>('preview')
    const { commit } = useCurrentCommit()
    const { project } = useCurrentProject()
    const expander = useExpandParametersOrEvaluations({
      initialExpanded: 'parameters',
    })
    const {
      parameters,
      source,
      setSource,
      history: { setHistoryLog },
    } = useDocumentParameters({
      commitVersionUuid: commit.uuid,
      document,
    })

    const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
      key: AppLocalStorage.chatDebugMode,
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
        setHistoryLog({ uuid: documentLogUuid, source: LogSources.Playground })
      },
      [setRunCount, setDocumentLogUuid, setHistoryLog],
    )
    const clearChat = useCallback(() => {
      expander.onToggle('parameters')(true)
      setMode('preview')
    }, [expander, setMode])
    const runPrompt = useCallback(() => {
      expander.closeAll()
      setMode('chat')
    }, [expander, setMode])
    const { runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream } =
      useRunPlaygroundPrompt({
        commit,
        projectId: project.id,
        document,
        parameters,
      })

    return (
      <div className='h-full px-4 relative min-h-0 flex flex-col gap-y-4 min-w-0'>
        <div className='min-h-8 flex flex-row items-center justify-between w-full'>
          <Text.H4M>Preview</Text.H4M>
          <Actions debugMode={debugMode} setDebugMode={setDebugMode} />
        </div>
        <div
          className={cn(
            'gap-2 w-full flex flex-col gap-y-2',
            expander.cssClass,
          )}
        >
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
          {mode === 'chat' ? (
            <DocumentEvaluations
              documentLog={documentLog}
              commit={commit}
              document={document}
              runCount={runCount}
              isExpanded={expander.evaluationsExpanded}
              onToggle={expander.onToggle('evaluations')}
              isLoading={isDocumentLogLoading}
            />
          ) : null}
        </div>
        <div className='h-full flex-grow flex flex-col gap-2 overflow-y-auto pr-0.5'>
          {mode === 'preview' ? (
            <Preview
              metadata={metadata}
              parameters={parameters}
              runPrompt={runPrompt}
              debugMode={debugMode}
              setDebugMode={setDebugMode}
            />
          ) : (
            <Chat
              canChat
              showHeader={false}
              parameters={parameters}
              clearChat={clearChat}
              abortCurrentStream={abortCurrentStream}
              hasActiveStream={hasActiveStream}
              isRunStream={true}
              runPromptFn={runPromptFn}
              addMessagesFn={addMessagesFn}
              onPromptRan={onPromptRan}
              debugMode={debugMode}
              setDebugMode={setDebugMode}
            />
          )}
        </div>
      </div>
    )
  },
)
