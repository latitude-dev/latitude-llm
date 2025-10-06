import { useMemo, useRef, useState } from 'react'
import { cn } from '@latitude-data/web-ui/utils'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { DocumentRoutes } from '$/services/routes'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import DocumentParams from '../V2Playground/DocumentParams'
import { ChatInputBox } from '../ChatInputBox'
import { AgentToolbar } from '../EditorHeader/AgentToolbar'
import { Editors } from '../Editors'
import { RunButton } from '../RunButton'
import { V2Playground } from '../V2Playground'
import { TabValue } from '../../../DocumentTabs/tabs'
import {
  useEditorCallbacks,
  usePlaygroundLogic,
  useToggleStates,
} from './hooks/usePlaygroundLogic'
import { DocumentEditorHeader } from './Header'

export function DocumentEditorContentArea({
  refinementEnabled,
  freeRunsCount,
  showPreview = false,
}: {
  refinementEnabled: boolean
  freeRunsCount?: number
  showPreview?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { metadata } = useMetadata()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const { updateDocumentContent } = useDocumentValue()
  const {
    isPlaygroundOpen,
    isPlaygroundTransitioning,
    isExperimentModalOpen,
    togglePlaygroundOpen,
    toggleExperimentModal,
  } = useToggleStates({ showPreview })
  const isMerged = useMemo(() => commit.mergedAt !== null, [commit.mergedAt])
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })
  const [selectedTab, setSelectedTab] = useState<TabValue>(
    showPreview ? 'preview' : DocumentRoutes.editor,
  )
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
  useAutoScroll(containerRef, { startAtBottom: playground.mode === 'chat' })
  const showPlayground =
    (!isPlaygroundTransitioning && isPlaygroundOpen) ||
    (isPlaygroundTransitioning && !isPlaygroundOpen)
  return (
    <>
      <div className='relative flex flex-col pt-6 h-full min-h-0 overflow-hidden'>
        <DocumentEditorHeader
          isMerged={isMerged}
          selectedTab={selectedTab}
          setSelectedTab={setSelectedTab}
          isPlaygroundOpen={isPlaygroundOpen}
          togglePlaygroundOpen={togglePlaygroundOpen}
          resetChat={resetChat}
        />

        {/* === SLIDING WRAPPER === */}
        <div className='relative p-4 pb-0 overflow-hidden h-full'>
          <div
            className={cn(
              'grid grid-cols-2 pb-4 h-full w-[200%]',
              'transition-transform duration-300',
              {
                '-translate-x-1/2 ': showPlayground,
              },
            )}
          >
            {/* === EDITOR SCREEN === */}
            <div
              className={cn(
                'relative h-full w-full transition-opacity duration-300',
                {
                  'opacity-0': showPlayground,
                  'opacity-100': !showPlayground,
                },
              )}
            >
              <div className='flex flex-col gap-4 h-full'>
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
                <div className='flex-1 min-h-0'>
                  <Editors
                    document={document}
                    refinementEnabled={refinementEnabled}
                  />
                </div>
              </div>
              <div className='absolute left-0 right-0 bottom-2 flex justify-center pointer-events-none'>
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
              ref={containerRef}
              className={cn(
                'relative h-full w-full transition-opacity duration-300',
                'relative flex-1 flex flex-col overflow-y-auto custom-scrollbar scollable-indicator',
                {
                  'opacity-0': !showPlayground,
                  'opacity-100': showPlayground,
                },
              )}
            >
              <div className='flex shrink-0 flex-grow min-h-0 flex-col gap-4'>
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
                <div className='pb-8'>
                  <V2Playground
                    metadata={metadata}
                    mode={playground.mode}
                    parameters={parameters}
                    playground={playground}
                  />
                </div>
              </div>
              <div
                className={cn(
                  'sticky bottom-2 flex flex-row items-center justify-center',
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

      <RunExperimentModal
        navigateOnCreate
        project={project}
        commit={commit}
        document={document}
        isOpen={isExperimentModalOpen}
        setOpen={toggleExperimentModal}
      />
    </>
  )
}
