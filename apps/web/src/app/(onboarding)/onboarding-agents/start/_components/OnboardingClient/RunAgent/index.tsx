import { useCallback, useRef, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Chat from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { OnboardingStep } from '../../../../../_lib/OnboardingStep'
import { usePlayground } from '../../../lib/PlaygroundProvider'
import { IsLoadingOnboardingItem } from '../../../lib/IsLoadingOnboardingItem'
import { useCurrentWorkspace } from '$/app/providers/WorkspaceProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { publishEventAction } from '$/actions/events/publishEventAction'

export function RunAgentHeader() {
  const { playground, hasActiveStream } = usePlayground()

  const promptIsRunning = useMemo(() => {
    return playground.isLoading || !playground.error || !hasActiveStream()
  }, [playground.isLoading, playground.error, hasActiveStream])

  return (
    <OnboardingStep.Header>
      {promptIsRunning ? (
        <div className='p-2 border-2 rounded-lg'>
          <Icon name='play' size='medium' />
        </div>
      ) : (
        <div className='p-2 rounded-lg bg-success-muted'>
          <Icon name='checkClean' size='medium' />
        </div>
      )}
      {promptIsRunning ? (
        <>
          <Text.H2M color='foreground' noWrap>
            Now watch your agent run
          </Text.H2M>
          <Text.H5 color='foregroundMuted'>
            Once triggered, agent will perform actions and call sub-agents by
            itself
          </Text.H5>
        </>
      ) : (
        <>
          <Text.H2M color='foreground' noWrap>
            Done!
          </Text.H2M>
          <Text.H5 color='foregroundMuted'>Now watch your agent run</Text.H5>
        </>
      )}
    </OnboardingStep.Header>
  )
}

export function RunAgentBody({
  executeCompleteOnboarding,
  parameters,
}: {
  executeCompleteOnboarding: ({
    projectId,
    commitUuid,
  }: {
    projectId: number
    commitUuid: string
  }) => void
  parameters: Record<string, unknown>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { workspace } = useCurrentWorkspace()
  const { playground, abortCurrentStream } = usePlayground()
  const { execute: publishEvent } = useLatitudeAction(publishEventAction)
  const handleNext = useCallback(() => {
    executeCompleteOnboarding({
      projectId: project.id,
      commitUuid: commit.uuid,
    })
    abortCurrentStream()
    publishEvent({
      eventType: 'agentOnboardingCompleted',
      payload: {
        workspaceId: workspace.id,
      },
    })
  }, [
    executeCompleteOnboarding,
    project,
    commit,
    abortCurrentStream,
    workspace.id,
    publishEvent,
  ])

  const containerRef = useRef<HTMLDivElement | null>(null)

  useAutoScroll(containerRef, { startAtBottom: true })

  const promptIsNotRunning = useMemo(() => {
    return playground.isLoading || playground.error !== undefined
  }, [playground.isLoading, playground.error])

  return (
    <OnboardingStep.Body>
      <div
        ref={containerRef}
        className='flex flex-col items-center gap-8 border-dashed border-2 rounded-xl p-2 w-full max-w-[600px] overflow-y-auto custom-scrollbar scrollable-indicator max-h-[400px] 2xl:max-h-[600px]'
      >
        {playground.messages.length === 0 && playground.error === undefined ? (
          <IsLoadingOnboardingItem
            highlightedText='Your agent'
            nonHighlightedText='will start running in a moment...'
          />
        ) : (
          <>
            <Chat
              showHeader={false}
              playground={playground}
              parameters={parameters}
            />
            <div className='sticky bottom-0 w-full bg-background pb-6'>
              <div className='flex relative flex-row w-full items-center justify-center'>
                {!playground.error && (
                  <StatusIndicator
                    playground={playground}
                    resetChat={() => {}}
                    stopStreaming={() => {}}
                    canStopStreaming={false}
                    streamAborted={false}
                    canChat={false}
                    position='bottom'
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <Button
        fancy
        onClick={handleNext}
        iconProps={{ name: 'chevronRight', placement: 'right' }}
        disabled={promptIsNotRunning}
      >
        Continue building
      </Button>
    </OnboardingStep.Body>
  )
}
