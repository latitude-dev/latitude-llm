import { LatteLayout } from '$/components/LatteLayout'
import { useCallback, useMemo, useState } from 'react'
import { DocumentEditorProps } from './OldDocumentEditor'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import useDocumentVersions from '$/stores/documentVersions'
import { useMetadata } from '$/hooks/useMetadata'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { DocumentTabSelector } from '../../DocumentTabs/tabs'
import { V2Playground } from './V2Playground'
import { useToggleModal } from '$/hooks/useToogleModal'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import DocumentParams from './V2Playground/DocumentParams'
import {
  Commit,
  LogSources,
  Project,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { TitleRow } from './EditorHeader/TitleRow'
import { AgentToolbar } from './EditorHeader/AgentToolbar'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { cn } from '@latitude-data/web-ui/utils'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useRunPlaygroundPrompt } from './Playground/hooks/useRunPlaygroundPrompt'
import { RunButton } from './RunButton'
import { ChatInputBox } from './ChatInputBox'
import { Editors } from './Editors'
import { DevModeProvider } from './hooks/useDevMode'
import {
  DocumentValueProvider,
  useDocumentValue,
} from './context/DocumentValueContext'
import { MetadataProvider } from '$/components/MetadataProvider'

export function DocumentEditor(props: DocumentEditorProps) {
  return (
    <MetadataProvider>
      <DevModeProvider>
        <DocumentValueProvider document={props.document}>
          <DocumentEditorContent {...props} />
        </DocumentValueProvider>
      </DevModeProvider>
    </MetadataProvider>
  )
}

function DocumentEditorContent({
  document: _document,
  documents: _documents,
  freeRunsCount,
  initialDiff,
}: DocumentEditorProps) {
  const { open: isPlaygroundOpen, onOpenChange: _togglePlaygroundOpen } =
    useToggleModal()
  const {
    open: isPlaygroundTransitioning,
    onOpenChange: togglePLaygroundTransitioning,
  } = useToggleModal()
  const { open: isExperimentModalOpen, onOpenChange: toggleExperimentModal } =
    useToggleModal()
  const togglePlaygroundOpen = useCallback(() => {
    togglePLaygroundTransitioning()
    setTimeout(() => {
      togglePLaygroundTransitioning()
      _togglePlaygroundOpen()
    }, 400)
  }, [_togglePlaygroundOpen, togglePLaygroundTransitioning])
  const { updateDocumentContent } = useDocumentValue()
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { data: documents } = useDocumentVersions(
    {
      commitUuid: commit.uuid,
      projectId: project.id,
    },
    {
      fallbackData: _documents,
    },
  )
  const document = useMemo(
    () =>
      documents?.find((d) => d.documentUuid === _document.documentUuid) ??
      _document,
    [documents, _document],
  )
  const name = useMemo(
    () => document.path.split('/').pop() ?? document.path,
    [document.path],
  )
  const isMerged = useMemo(() => commit.mergedAt !== null, [commit.mergedAt])
  const { metadata } = useMetadata()
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })
  const {
    parameters,
    source,
    setSource,
    history: { setHistoryLog },
  } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
  })
  const focusFirstParameterInput = useCallback(
    (parameters: Record<string, unknown> = {}) => {
      const inputElement = window.document.querySelector(
        `[name="${Object.keys(parameters ?? {})[0]}"]`,
      )
      // @ts-expect-error - TS is wrong? the inputElement has a focus method
      if (inputElement) inputElement.focus()
    },
    [],
  )
  const runPromptButtonHandler = useCallback(() => {
    if (!isPlaygroundOpen) {
      togglePlaygroundOpen()
      if (Object.keys(parameters ?? {}).length === 0) {
        setMode('chat')
      } else {
        focusFirstParameterInput(parameters)
      }
    } else {
      setMode('chat')
    }
  }, [
    setMode,
    togglePlaygroundOpen,
    parameters,
    focusFirstParameterInput,
    isPlaygroundOpen,
  ])
  const toggleDocumentParamsHandler = useCallback(() => {
    setMode('preview')
    togglePlaygroundOpen()
    focusFirstParameterInput(parameters)
  }, [togglePlaygroundOpen, parameters, focusFirstParameterInput])
  const isDocumentParamsOpen = useMemo(
    () =>
      (!isPlaygroundOpen && isPlaygroundTransitioning) ||
      (isPlaygroundOpen && !isPlaygroundTransitioning),
    [isPlaygroundOpen, isPlaygroundTransitioning],
  )
  const calcExpandedHeight = useCallback(
    (parameters: Record<string, unknown> | undefined) => {
      const keys = Object.keys(parameters ?? {})
      if (!keys.length) return 90

      return 64 + keys.length * 44
    },
    [],
  )
  const { playground, hasActiveStream, clearChat, stopStreaming } =
    usePlaygroundLogic({
      commit: commit as Commit,
      project: project as Project,
      document,
      parameters,
      setMode,
      togglePlaygroundOpen,
      setHistoryLog,
    })

  return (
    <LatteLayout>
      <div
        className={cn('relative flex flex-col p-4 h-full min-h-0', {
          'h-auto min-h-full': isPlaygroundOpen && !isPlaygroundTransitioning,
        })}
      >
        <div className='pb-5'>
          <DocumentTabSelector
            projectId={String(project.id)}
            commitUuid={commit.uuid}
            documentUuid={document.documentUuid}
          />
        </div>
        <div className='pb-4'>
          <TitleRow
            title={name}
            isAgent={metadata?.config?.type === 'agent'}
            isMerged={isMerged}
            metadataConfig={metadata?.config}
            prompt={document.content}
            onChangePrompt={updateDocumentContent}
          />
        </div>
        <div
          className={cn(
            'flex flex-col gap-4 pb-4 transition-all duration-300 ease-in-out h-full min-h-0',
            {
              'h-0 opacity-0 pb-0':
                (isPlaygroundTransitioning && !isPlaygroundOpen) ||
                (!isPlaygroundTransitioning && isPlaygroundOpen),
            },
          )}
        >
          <AgentToolbar
            isMerged={isMerged}
            isAgent={metadata?.config?.type === 'agent'}
            config={metadata?.config}
            prompt={document.content}
            onChangePrompt={updateDocumentContent}
          />
          <FreeRunsBanner
            isLatitudeProvider={isLatitudeProvider}
            freeRunsCount={freeRunsCount}
          />
          <div className='flex-1 overflow-y-auto'>
            <Editors document={document} initialDiff={initialDiff} />
          </div>
        </div>
        <div>
          <DocumentParams
            commit={commit}
            document={document}
            prompt={document.content}
            source={source}
            setSource={setSource}
            setPrompt={updateDocumentContent}
            onToggle={toggleDocumentParamsHandler}
            isExpanded={isDocumentParamsOpen}
            expandedHeight={calcExpandedHeight(parameters)}
          />
        </div>
        <div
          className={cn('flex-1 h-0 opacity-0 overflow-hidden py-4', {
            'h-auto opacity-1':
              (!isPlaygroundTransitioning && isPlaygroundOpen) ||
              (isPlaygroundTransitioning && !isPlaygroundOpen),
          })}
        >
          {((isPlaygroundTransitioning && !isPlaygroundOpen) ||
            isPlaygroundOpen) && (
            <V2Playground
              metadata={metadata}
              mode={mode}
              parameters={parameters}
              playground={playground}
            />
          )}
        </div>
        <div
          className={cn(
            'sticky left-0 bottom-4 z-[11] flex flex-row items-center justify-center',
            {
              'absolute left-[calc(50%-124px)]':
                !isPlaygroundOpen ||
                (isPlaygroundTransitioning && isPlaygroundOpen),
            },
          )}
        >
          {mode === 'preview' && (
            <RunButton
              metadata={metadata}
              runPromptButtonHandler={runPromptButtonHandler}
              toggleExperimentModal={toggleExperimentModal}
            />
          )}
          {mode === 'chat' && (
            <ChatInputBox
              canChat
              clearChat={clearChat}
              hasActiveStream={hasActiveStream}
              playground={playground}
              stopStreaming={stopStreaming}
            />
          )}
        </div>
      </div>
      <RunExperimentModal
        navigateOnCreate
        project={project as Project}
        commit={commit as Commit}
        document={document}
        isOpen={isExperimentModalOpen}
        setOpen={toggleExperimentModal}
      />
    </LatteLayout>
  )
}

/**
 * Local hook that manages playground-related logic and state
 */
function usePlaygroundLogic({
  commit,
  project,
  document,
  parameters,
  setMode,
  togglePlaygroundOpen,
  setHistoryLog,
}: {
  commit: Commit
  project: Project
  document: DocumentVersion
  parameters: Record<string, any> | undefined
  setMode: (mode: 'preview' | 'chat') => void
  togglePlaygroundOpen: () => void
  setHistoryLog: (log: { uuid: string; source: LogSources }) => void
}) {
  const onPromptRan = useCallback(
    (documentLogUuid?: string, error?: Error) => {
      if (!documentLogUuid || error) return

      setHistoryLog({ uuid: documentLogUuid, source: LogSources.Playground })
    },
    [setHistoryLog],
  )

  const { runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream } =
    useRunPlaygroundPrompt({
      commit,
      projectId: project.id,
      document,
      parameters,
    })

  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn,
    onPromptRan,
  })

  const clearChat = useCallback(() => {
    setMode('preview')
    togglePlaygroundOpen()
    playground.reset()
  }, [setMode, togglePlaygroundOpen, playground])

  const stopStreaming = useCallback(() => {
    // We only clear the stream if it's the first generation as otherwise the
    // UI is in an non-obvious state for the user
    if (abortCurrentStream() && playground.messages.length <= 1) {
      // Only clear chat if stream was actually aborted
      clearChat()
    }
  }, [abortCurrentStream, clearChat, playground.messages.length])

  return useMemo(
    () => ({
      playground,
      hasActiveStream,
      clearChat,
      stopStreaming,
    }),
    [playground, hasActiveStream, clearChat, stopStreaming],
  )
}
