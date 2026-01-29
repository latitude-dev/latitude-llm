import { useCallback, useMemo } from 'react'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { INPUT_SOURCE } from '@latitude-data/core/lib/documentPersistedInputs'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { DocumentRoutes } from '$/services/routes'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useToggleModal } from '$/hooks/useToogleModal'
import { TabValue } from '../../../../DocumentTabs/tabs'
import { useRunPlaygroundPrompt } from '../../Playground/hooks/useRunPlaygroundPrompt'

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
  setSelectedTab,
}: {
  commit: Commit
  project: Project
  document: DocumentVersion
  parameters: Record<string, any> | undefined
  togglePlaygroundOpen: () => void
  setSelectedTab: ReactStateDispatch<TabValue>
  userMessage?: string
}) {
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
    abortCurrentStream,
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
export function useEditorCallbacks({
  playground,
  isPlaygroundOpen,
  togglePlaygroundOpen,
  setSelectedTab,
  setUserMessage,
}: {
  playground: ReturnType<typeof usePlaygroundChat>
  isPlaygroundOpen: boolean
  togglePlaygroundOpen: () => void
  resetChat: () => void
  source: (typeof INPUT_SOURCE)[keyof typeof INPUT_SOURCE]
  setSelectedTab: ReactStateDispatch<TabValue>
  setUserMessage: ReactStateDispatch<string>
}) {
  const runPromptButtonHandler = useCallback(() => {
    if (!isPlaygroundOpen) {
      setSelectedTab('preview')
      togglePlaygroundOpen()
    } else {
      playground.start()
    }
    setUserMessage('')
  }, [
    playground,
    togglePlaygroundOpen,
    isPlaygroundOpen,
    setSelectedTab,
    setUserMessage,
  ])

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
export function useToggleStates({ showPreview = false }) {
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
