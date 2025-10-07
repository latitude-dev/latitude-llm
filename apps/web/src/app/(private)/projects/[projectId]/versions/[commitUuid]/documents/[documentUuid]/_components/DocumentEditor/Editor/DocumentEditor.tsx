import { FreeRunsBanner } from '$/components/FreeRunsBanner'
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
import { DocumentRoutes } from '$/services/routes'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { useToggleModal } from '$/hooks/useToogleModal'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useDeployPrompt } from '../../DocumentationModal'
import { DocumentTabSelector, TabValue } from '../../DocumentTabs/tabs'
import { ChatInputBox } from './ChatInputBox'
import { AgentToolbar } from './EditorHeader/AgentToolbar'
import { TitleRow } from './EditorHeader/TitleRow'
import { Editors } from './Editors'
import { useRunPlaygroundPrompt } from './Playground/hooks/useRunPlaygroundPrompt'
import { RunButton } from './RunButton'
import { V2Playground } from './V2Playground'
import DocumentParams from './V2Playground/DocumentParams'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  Commit,
  DocumentVersion,
  Project,
  type ProviderApiKey,
} from '@latitude-data/core/schema/types'
import { INPUT_SOURCE } from '@latitude-data/core/lib/documentPersistedInputs'
import { LogSources } from '@latitude-data/core/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

export type DocumentEditorProps = {
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
  copilotEnabled: boolean
  refinementEnabled: boolean
  experimentDiff?: string
  showPreview?: boolean
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
  showPreview = false,
}: Omit<DocumentEditorProps, 'experimentDiff'>) {
  const { updateDocumentContent } = useDocumentValue()
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
  } = useToggleStates({ showPreview })
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
  const [selectedTab, setSelectedTab] = useState<TabValue>(
    showPreview ? 'preview' : DocumentRoutes.editor,
  )
  const { playground, hasActiveStream, resetChat, onBack, stopStreaming } =
    usePlaygroundLogic({
      commit,
      project,
      document,
      parameters,
      togglePlaygroundOpen,
      setHistoryLog,
      setSelectedTab,
    })
  const { runPromptButtonHandler } = useEditorCallbacks({
    isPlaygroundOpen,
    togglePlaygroundOpen,
    resetChat,
    source,
    playground,
    setSelectedTab,
  })
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onPreviewToggle = useCallback(
    (showPreview: boolean) => {
      setSelectedTab(showPreview ? 'preview' : DocumentRoutes.editor)

      if (showPreview) {
        // Show preview (open playground)
        if (!isPlaygroundOpen) togglePlaygroundOpen()
      } else {
        // Show editor
        if (isPlaygroundOpen) togglePlaygroundOpen()
        resetChat()
      }
    },
    [isPlaygroundOpen, togglePlaygroundOpen, resetChat],
  )

  useAutoScroll(containerRef, { startAtBottom: playground.mode === 'chat' })

  const showPlayground =
    (!isPlaygroundTransitioning && isPlaygroundOpen) ||
    (isPlaygroundTransitioning && !isPlaygroundOpen)

  return (
    <>
      <div className='relative flex flex-col pt-6 h-full min-h-0 overflow-hidden'>
        {/* Header Section */}
        <div className='w-full flex flex-col justify-center items-start gap-4 px-4 pb-4'>
          <div className='w-full flex flex-row items-center justify-between gap-4'>
            <DocumentTabSelector
              selectedTab={selectedTab}
              onSelectTab={setSelectedTab}
              projectId={String(project.id)}
              commitUuid={commit.uuid}
              documentUuid={document.documentUuid}
              onPreviewToggle={onPreviewToggle}
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

        <div className='relative flex-1 overflow-hidden'>
          <div className='absolute inset-4 bottom-0 overflow-hidden'>
            {/* === EDITOR SCREEN === */}
            <div
              className={cn(
                'absolute inset-0 transition-transform duration-200',
                {
                  '-translate-x-full': showPlayground,
                  'translate-x-0': !showPlayground,
                },
              )}
            >
              <div className='flex flex-col gap-4 h-full pb-4'>
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
                <div className='flex-1 overflow-y-auto custom-scrollbar'>
                  <Editors
                    document={document}
                    refinementEnabled={refinementEnabled}
                  />
                </div>
              </div>
              <div
                className={cn(
                  'sticky left-0 -bottom-2 z-[11] flex flex-row items-center justify-center',
                  'absolute left-1/2 -translate-x-1/2 bottom-2',
                )}
              >
                <RunButton
                  metadata={metadata}
                  showPlayground={showPlayground}
                  runPromptButtonProps={{
                    label: 'Preview',
                    iconProps: { name: 'arrowRight' },
                  }}
                  runPromptButtonHandler={runPromptButtonHandler}
                  onBack={onBack}
                  toggleExperimentModal={toggleExperimentModal}
                />
              </div>
            </div>

            {/* === PREVIEW / CHAT SCREEN === */}
            <div
              className={cn(
                'absolute inset-0 transition-transform duration-200',
                {
                  'translate-x-full': !showPlayground,
                  'translate-x-0': showPlayground,
                },
              )}
            >
              <div className='flex flex-col gap-4 h-full'>
                <div
                  ref={containerRef}
                  className='flex-1 overflow-y-auto custom-scrollbar scollable-indicator'
                >
                  <div className='flex flex-col gap-4 min-h-full'>
                    <div className='pb-4'>
                      <DocumentParams
                        commit={commit}
                        document={document}
                        prompt={document.content}
                        source={source}
                        setSource={setSource}
                        setPrompt={updateDocumentContent}
                      />
                    </div>
                    <V2Playground
                      metadata={metadata}
                      mode={playground.mode}
                      parameters={parameters}
                      playground={playground}
                    />
                  </div>
                  <div
                    className={cn(
                      'sticky bottom-2 left-0 z-[11] flex flex-row items-center justify-center',
                    )}
                  >
                    {playground.mode === 'preview' && (
                      <RunButton
                        metadata={metadata}
                        showPlayground={showPlayground}
                        runPromptButtonProps={{
                          label: 'Run',
                          iconProps: { name: 'circlePlay' },
                        }}
                        runPromptButtonHandler={runPromptButtonHandler}
                        onBack={onBack}
                        toggleExperimentModal={toggleExperimentModal}
                      />
                    )}
                    {playground.mode === 'chat' && (
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
            </div>
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
    </>
  )
}

/**
 * Hook that manages playground-related logic and state for document execution
 * @param params - Configuration parameters for playground functionality
 * @param params.commit - The current commit containing the document
 * @param params.project - The project containing the document
 * @param params.document - The document version to execute in playground
 * @param params.parameters - Document parameters for execution context
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
  togglePlaygroundOpen,
  setHistoryLog,
  setSelectedTab,
}: {
  commit: Commit
  project: Project
  document: DocumentVersion
  parameters: Record<string, any> | undefined
  togglePlaygroundOpen: () => void
  setHistoryLog: (log: { uuid: string; source: LogSources }) => void
  setSelectedTab: ReactStateDispatch<TabValue>
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
    playground.reset()
  }, [playground])

  const onBack = useCallback(() => {
    togglePlaygroundOpen()
    resetChat()
    setSelectedTab(DocumentRoutes.editor)
  }, [togglePlaygroundOpen, resetChat, setSelectedTab])

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
 * @param params.parameters - Document parameters object
 * @param params.source - Input source type (manual, dataset, history)
 * @returns Object containing callback functions and height calculation utility
 */
function useEditorCallbacks({
  playground,
  isPlaygroundOpen,
  togglePlaygroundOpen,
  setSelectedTab,
}: {
  playground: ReturnType<typeof usePlaygroundChat>
  isPlaygroundOpen: boolean
  togglePlaygroundOpen: () => void
  resetChat: () => void
  source: (typeof INPUT_SOURCE)[keyof typeof INPUT_SOURCE]
  setSelectedTab: ReactStateDispatch<TabValue>
}) {
  const runPromptButtonHandler = useCallback(() => {
    if (!isPlaygroundOpen) {
      setSelectedTab('preview')
      togglePlaygroundOpen()
    } else {
      playground.start()
    }
  }, [playground, togglePlaygroundOpen, isPlaygroundOpen, setSelectedTab])

  return useMemo(
    () => ({
      runPromptButtonHandler,
    }),
    [runPromptButtonHandler],
  )
}

/**
 * Hook that manages toggle states for playground and experiment modal
 * @returns Object containing playground and modal state management functions
 */
function useToggleStates({ showPreview = false }) {
  const { open: isPlaygroundOpen, onOpenChange: _togglePlaygroundOpen } =
    useToggleModal({ initialState: showPreview })
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
