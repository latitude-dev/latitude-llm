import { useMemo, useRef, useState } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { useDevMode } from '$/hooks/useDevMode'

import { useMetadata } from '$/hooks/useMetadata'
import { useMetadataParameters } from '$/hooks/useMetadataParameters'
import { useFormattedParameters } from '../V2Playground/DocumentParams/DocumentParametersContext'
import { useInputSource } from '$/hooks/useInputSource'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { cn } from '@latitude-data/web-ui/utils'
import { TabValue } from '../../../DocumentTabs/tabs'
import { ChatInputBox } from '../ChatInputBox'
import { Editors } from '../Editors'
import { RunButton } from '../RunButton'
import { V2Playground } from '../V2Playground'
import DocumentParams from '../V2Playground/DocumentParams'
import {
  useEditorCallbacks,
  usePlaygroundLogic,
} from './hooks/usePlaygroundLogic'
import { ChatTextArea } from '../ChatInputBox/ChatTextArea'

export function DocumentEditorContentArea({
  refinementEnabled,
  setSelectedTab,
  isExperimentModalOpen,
  toggleExperimentModal,
  isPlaygroundOpen,
  togglePlaygroundOpen,
  isPlaygroundTransitioning,
}: {
  refinementEnabled: boolean
  setSelectedTab: ReactStateDispatch<TabValue>
  isExperimentModalOpen: boolean
  toggleExperimentModal: () => void
  isPlaygroundOpen: boolean
  togglePlaygroundOpen: () => void
  isPlaygroundTransitioning: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { metadata } = useMetadata()
  const { parameters: metadataParameters } = useMetadataParameters()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const { source, setSource } = useInputSource()
  const parameters = useFormattedParameters()
  const hasParameters = useMemo(
    () => metadataParameters && metadataParameters.length > 0,
    [metadataParameters],
  )

  const [_userMessage, setUserMessage] = useState<string>('')
  const userMessage = useMemo(() => {
    if (hasParameters) return undefined
    if (!_userMessage.length) return undefined
    return _userMessage
  }, [_userMessage, hasParameters])

  const { devMode } = useDevMode()
  const { playground, hasActiveStream, resetChat, onBack } = usePlaygroundLogic(
    {
      commit,
      project,
      document,
      parameters: parameters,
      userMessage,
      togglePlaygroundOpen,
      setSelectedTab,
    },
  )
  const { runPromptButtonHandler } = useEditorCallbacks({
    isPlaygroundOpen,
    togglePlaygroundOpen,
    resetChat,
    source,
    playground,
    setSelectedTab,
    setUserMessage,
  })
  useAutoScroll(containerRef, { startAtBottom: playground.mode === 'chat' })
  const showPlayground =
    (!isPlaygroundTransitioning && isPlaygroundOpen) ||
    (isPlaygroundTransitioning && !isPlaygroundOpen)

  return (
    <>
      <div className='relative flex-1 flex flex-col h-full min-h-0 overflow-hidden'>
        {/* === SLIDING WRAPPER === */}
        <div
          className={cn(
            'min-h-0 grid grid-cols-2 h-full w-[200%]',
            'transition-transform duration-300',
            {
              '-translate-x-1/2 ': showPlayground,
            },
          )}
        >
          {/* === EDITOR SCREEN === */}
          <div
            className={cn(
              'relative min-h-0 h-full w-full transition-opacity duration-300',
              {
                'opacity-0': showPlayground,
                'opacity-100': !showPlayground,
              },
            )}
          >
            <div className='min-h-0 relative z-0 flex flex-col gap-4 h-full'>
              <div
                className={cn('flex-1 min-h-0 pb-4', {
                  'overflow-y-auto custom-scrollbar scrollable-indicator':
                    !devMode,
                })}
              >
                <Editors
                  document={document}
                  refinementEnabled={refinementEnabled}
                />
              </div>
            </div>
            <div
              className={cn(
                'z-10 left-0 right-0 bottom-2 flex justify-center pointer-events-none',
                {
                  absolute: devMode,
                  sticky: !devMode,
                },
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
            <div
              className={cn('shrink-0 flex-grow flex flex-col gap-4', {
                'pb-8': playground.mode === 'preview',
                'pb-20': playground.mode === 'chat',
              })}
            >
              {hasParameters && (
                <DocumentParams
                  commit={commit}
                  document={document}
                  source={source}
                  setSource={setSource}
                />
              )}
              <V2Playground
                metadata={metadata}
                mode={playground.mode}
                parameters={parameters}
                playground={playground}
              />
            </div>
            <div
              className={cn(
                'sticky bottom-2 flex flex-row items-center justify-center px-4',
              )}
            >
              {playground.mode === 'preview' &&
                (hasParameters ? (
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
                ) : (
                  <ChatTextArea
                    minRows={5}
                    placeholder='Add a user message or run the prompt without any user input'
                    onSubmit={runPromptButtonHandler}
                    onChange={setUserMessage}
                    onBack={onBack}
                    onBackLabel='Edit'
                    onSubmitLabel={
                      userMessage?.length ? 'Send Message' : 'Run without input'
                    }
                    canSubmitWithEmptyValue
                  />
                ))}
              {playground.mode === 'chat' && (
                <ChatInputBox
                  onBack={onBack}
                  resetChat={resetChat}
                  hasActiveStream={hasActiveStream}
                  playground={playground}
                />
              )}
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
