import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { LatteLayout } from '$/components/LatteLayout'
import { MetadataProvider } from '$/components/MetadataProvider'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { DevModeProvider } from '$/hooks/useDevMode'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  DocumentValueProvider,
  useDocumentValue,
} from '$/hooks/useDocumentValueContext'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { useToggleModal } from '$/hooks/useToogleModal'
import {
  Commit,
  DocumentVersion,
  INPUT_SOURCE,
  LogSources,
  Project,
} from '@latitude-data/core/browser'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useMemo, useState } from 'react'
import { DocumentTabSelector } from '../../DocumentTabs/tabs'
import { ChatInputBox } from './ChatInputBox'
import { AgentToolbar } from './EditorHeader/AgentToolbar'
import { TitleRow } from './EditorHeader/TitleRow'
import { Editors } from './Editors'
import { DocumentEditorProps } from './OldDocumentEditor'
import { useRunPlaygroundPrompt } from './Playground/hooks/useRunPlaygroundPrompt'
import { RunButton } from './RunButton'
import { V2Playground } from './V2Playground'
import DocumentParams from './V2Playground/DocumentParams'

export function DocumentEditor(props: DocumentEditorProps) {
  return (
    <MetadataProvider>
      <DevModeProvider>
        <DocumentValueProvider
          document={props.document}
          documents={props.documents}
        >
          <DocumentEditorContent {...props} />
        </DocumentValueProvider>
      </DevModeProvider>
    </MetadataProvider>
  )
}

const MANUAL_BASE_HEIGHT = 64
const DATASET_BASE_HEIGHT = 64 + 49 + 16
const HISTORY_BASE_HEIGHT = 64 + 41 + 16
const MANUAL_ELM_HEIGHT = 44
const DATASET_ELM_HEIGHT = 52 + 16
const HISTORY_ELM_HEIGHT = 44

/**
 * Main content component for the document editor that handles the UI layout and state management
 * @param props - Document editor properties
 * @param props.document - The document to edit
 * @param props.documents - Array of all documents in the commit
 * @param props.freeRunsCount - Number of free runs available
 * @param props.initialDiff - Initial diff data for the document
 */
function DocumentEditorContent({
  freeRunsCount,
  initialDiff,
}: DocumentEditorProps) {
  const { updateDocumentContent, document } = useDocumentValue()
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { metadata } = useMetadata()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const {
    isPlaygroundOpen,
    isPlaygroundTransitioning,
    isExperimentModalOpen,
    togglePlaygroundOpen,
    toggleExperimentModal,
  } = useToggleStates()
  const name = useMemo(
    () => document.path.split('/').pop() ?? document.path,
    [document.path],
  )
  const isMerged = useMemo(() => commit.mergedAt !== null, [commit.mergedAt])
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
  const {
    calcExpandedHeight,
    runPromptButtonHandler,
    toggleDocumentParamsHandler,
  } = useEditorCallbacks({
    isPlaygroundOpen,
    togglePlaygroundOpen,
    setMode,
    parameters,
    source,
  })
  const isDocumentParamsOpen = useMemo(
    () =>
      (!isPlaygroundOpen && isPlaygroundTransitioning) ||
      (isPlaygroundOpen && !isPlaygroundTransitioning),
    [isPlaygroundOpen, isPlaygroundTransitioning],
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
        className={cn('relative flex flex-col px-4 pt-6 pb-4 h-full min-h-0', {
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
            expandedHeight={
              isPlaygroundTransitioning
                ? calcExpandedHeight(parameters)
                : undefined
            }
            maxHeight='calc((100vh / 2) - 10rem)'
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
 * Hook that manages playground-related logic and state for document execution
 * @param params - Configuration parameters for playground functionality
 * @param params.commit - The current commit containing the document
 * @param params.project - The project containing the document
 * @param params.document - The document version to execute in playground
 * @param params.parameters - Document parameters for execution context
 * @param params.setMode - Function to switch between preview and chat modes
 * @param params.togglePlaygroundOpen - Function to toggle playground visibility
 * @param params.setHistoryLog - Function to log execution history
 * @returns Object containing playground state and control functions
 * @returns playground - The playground chat instance with message history
 * @returns hasActiveStream - Whether there's currently an active streaming response
 * @returns clearChat - Function to clear chat history and reset playground
 * @returns stopStreaming - Function to stop current streaming and optionally clear chat
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

/**
 * Hook that manages editor callback functions for playground interactions
 * @param params - Configuration parameters
 * @param params.isPlaygroundOpen - Whether the playground is currently open
 * @param params.togglePlaygroundOpen - Function to toggle playground open/closed
 * @param params.setMode - Function to set preview/chat mode
 * @param params.parameters - Document parameters object
 * @param params.source - Input source type (manual, dataset, history)
 * @returns Object containing callback functions and height calculation utility
 */
function useEditorCallbacks({
  isPlaygroundOpen,
  togglePlaygroundOpen,
  setMode,
  parameters,
  source,
}: {
  isPlaygroundOpen: boolean
  togglePlaygroundOpen: () => void
  setMode: (mode: 'preview' | 'chat') => void
  parameters: Record<string, any> | undefined
  source: (typeof INPUT_SOURCE)[keyof typeof INPUT_SOURCE]
}) {
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
  }, [togglePlaygroundOpen, parameters, focusFirstParameterInput, setMode])
  const calcExpandedHeight = useCallback(
    (parameters: Record<string, unknown> | undefined) => {
      const keys = Object.keys(parameters ?? {})
      if (!keys.length) return 90

      const baseHeight =
        source === INPUT_SOURCE.manual
          ? MANUAL_BASE_HEIGHT
          : source === INPUT_SOURCE.dataset
            ? DATASET_BASE_HEIGHT
            : HISTORY_BASE_HEIGHT
      const elmHeight =
        source === INPUT_SOURCE.manual
          ? MANUAL_ELM_HEIGHT
          : source === INPUT_SOURCE.dataset
            ? DATASET_ELM_HEIGHT
            : HISTORY_ELM_HEIGHT

      return baseHeight + keys.length * elmHeight
    },
    [source],
  )

  return useMemo(
    () => ({
      focusFirstParameterInput,
      calcExpandedHeight,
      runPromptButtonHandler,
      toggleDocumentParamsHandler,
    }),
    [
      focusFirstParameterInput,
      runPromptButtonHandler,
      toggleDocumentParamsHandler,
      calcExpandedHeight,
    ],
  )
}

/**
 * Hook that manages toggle states for playground and experiment modal
 * @returns Object containing playground and modal state management functions
 */
function useToggleStates() {
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

  return useMemo(
    () => ({
      isPlaygroundOpen,
      isPlaygroundTransitioning,
      isExperimentModalOpen,
      togglePlaygroundOpen,
      togglePLaygroundTransitioning,
      toggleExperimentModal,
    }),
    [
      isPlaygroundOpen,
      isPlaygroundTransitioning,
      isExperimentModalOpen,
      togglePlaygroundOpen,
      togglePLaygroundTransitioning,
      toggleExperimentModal,
    ],
  )
}
