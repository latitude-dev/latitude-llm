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
import { ExperimentDiffProvider } from '$/hooks/useExperimentDiffContext'
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
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useDeployPrompt } from '../../DocumentationModal'
import { DocumentTabSelector } from '../../DocumentTabs/tabs'
import { ChatInputBox } from './ChatInputBox'
import { AgentToolbar } from './EditorHeader/AgentToolbar'
import { TitleRow } from './EditorHeader/TitleRow'
import { Editors } from './Editors'
import { useRunPlaygroundPrompt } from './Playground/hooks/useRunPlaygroundPrompt'
import { RunButton } from './RunButton'
import { V2Playground } from './V2Playground'
import DocumentParams from './V2Playground/DocumentParams'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import type {
  ProviderApiKey,
  ProviderLogDto,
} from '@latitude-data/core/browser'

export type DocumentEditorProps = {
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
  copilotEnabled: boolean
  refinementEnabled: boolean
  experimentDiff?: string
  initialThreadUuid?: string
  initialProviderLog?: ProviderLogDto
}

export function DocumentEditor(props: DocumentEditorProps) {
  return (
    <MetadataProvider>
      <DevModeProvider>
        <DocumentValueProvider
          document={props.document}
          documents={props.documents}
        >
          <ExperimentDiffProvider diff={props.experimentDiff || undefined}>
            <DocumentEditorContent {...props} />
          </ExperimentDiffProvider>
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
  document: doc,
  freeRunsCount,
  refinementEnabled,
  initialThreadUuid,
  initialProviderLog,
}: Omit<DocumentEditorProps, 'experimentDiff'>) {
  const { updateDocumentContent } = useDocumentValue()
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { metadata } = useMetadata()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { toggleDocumentation } = useDeployPrompt()
  const { document } = useCurrentDocument()
  const {
    isPlaygroundOpen,
    isPlaygroundTransitioning,
    isExperimentModalOpen,
    togglePlaygroundOpen,
    toggleExperimentModal,
  } = useToggleStates()
  const name = useMemo(() => doc.path.split('/').pop() ?? doc.path, [doc.path])
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
  const { playground, hasActiveStream, resetChat, onBack, stopStreaming } =
    usePlaygroundLogic({
      commit,
      project,
      document,
      parameters,
      setMode,
      togglePlaygroundOpen,
      setHistoryLog,
    })
  const {
    calcExpandedHeight,
    runPromptButtonLabel,
    runPromptButtonHandler,
    toggleDocumentParamsHandler,
  } = useEditorCallbacks({
    isPlaygroundOpen,
    togglePlaygroundOpen,
    setMode,
    resetChat,
    parameters,
    source,
  })
  const isDocumentParamsOpen = useMemo(
    () =>
      (!isPlaygroundOpen && isPlaygroundTransitioning) ||
      (isPlaygroundOpen && !isPlaygroundTransitioning),
    [isPlaygroundOpen, isPlaygroundTransitioning],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)

  useAutoScroll(containerRef, { startAtBottom: mode === 'chat' })

  return (
    <LatteLayout
      initialThreadUuid={initialThreadUuid}
      initialProviderLog={initialProviderLog}
    >
      <div className='relative flex flex-col pt-6 h-full min-h-0'>
        <div className='w-full flex flex-col justify-center items-start gap-4 px-4 pb-4'>
          <div className='w-full flex flex-row items-center justify-between gap-4'>
            <DocumentTabSelector
              projectId={String(project.id)}
              commitUuid={commit.uuid}
              documentUuid={document.documentUuid}
            />
            <Button
              variant='ghost'
              onClick={toggleDocumentation}
              iconProps={{ name: 'code2', placement: 'right' }}
              className='truncate hover:text-primary transition-colors'
              userSelect={false}
            >
              Deploy
            </Button>
          </div>
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
          ref={containerRef}
          className={cn(
            'relative flex flex-col flex-1 px-4 custom-scrollbar scrollable-indicator',
            {
              'overflow-y-auto': isPlaygroundOpen && !isPlaygroundTransitioning,
            },
          )}
        >
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
              <Editors
                document={document}
                refinementEnabled={refinementEnabled}
              />
            </div>
          </div>
          <div className='pb-4'>
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
            className={cn('flex-1 h-0 opacity-0 py-4', {
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
              'sticky left-0 bottom-0 pb-4 z-[11] flex flex-row items-center justify-center bg-background',
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
                runPromptButtonLabel={runPromptButtonLabel}
                runPromptButtonHandler={runPromptButtonHandler}
                toggleExperimentModal={toggleExperimentModal}
              />
            )}
            {mode === 'chat' && (
              <ChatInputBox
                onBack={onBack}
                resetChat={resetChat}
                hasActiveStream={hasActiveStream}
                playground={playground}
                stopStreaming={stopStreaming}
              />
            )}
          </div>
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
 * @param params.userMessage - Inject user message into the prompt
 * @returns Object containing playground state and control functions
 * @returns playground - The playground chat instance with message history
 * @returns hasActiveStream - Whether there's currently an active streaming response
 * @returns resetChat - Function to reset the chat and switch to preview mode
 * @returns onBack - Function to go back to preview mode
 * @returns stopStreaming - Function to stop current streaming and optionally clear chat
 */
export function usePlaygroundLogic({
  commit,
  project,
  document,
  parameters,
  userMessage,
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
  userMessage?: string
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
      userMessage,
    })

  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn,
    onPromptRan,
  })

  const resetChat = useCallback(() => {
    setMode('preview')
    playground.reset()
  }, [setMode, playground])

  const onBack = useCallback(() => {
    togglePlaygroundOpen()
    resetChat()
  }, [togglePlaygroundOpen, resetChat])

  const stopStreaming = useCallback(() => {
    abortCurrentStream()
  }, [abortCurrentStream])

  return useMemo(
    () => ({
      playground,
      hasActiveStream,
      resetChat,
      onBack,
      stopStreaming,
    }),
    [playground, hasActiveStream, resetChat, onBack, stopStreaming],
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
  resetChat,
  parameters,
  source,
}: {
  isPlaygroundOpen: boolean
  togglePlaygroundOpen: () => void
  setMode: (mode: 'preview' | 'chat') => void
  resetChat: () => void
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
  const runPromptButtonLabel = useMemo(() => {
    return isPlaygroundOpen ? 'Run' : 'Preview'
  }, [isPlaygroundOpen])
  const runPromptButtonHandler = useCallback(() => {
    if (!isPlaygroundOpen) {
      togglePlaygroundOpen()
      if (Object.keys(parameters ?? {}).length > 0) {
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
    togglePlaygroundOpen()
    resetChat()
    focusFirstParameterInput(parameters)
  }, [togglePlaygroundOpen, parameters, focusFirstParameterInput, resetChat])
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
      runPromptButtonLabel,
      runPromptButtonHandler,
      toggleDocumentParamsHandler,
    }),
    [
      focusFirstParameterInput,
      runPromptButtonLabel,
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
