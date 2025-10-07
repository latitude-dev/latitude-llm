import { useCallback, useRef, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Chat from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { ActiveTrigger } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersList'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { OnboardingStep } from '../../../lib/OnboardingStep'
import { usePlayground } from '../../../lib/PlaygroundProvider'
import { IsLoadingOnboardingItem } from '../../../lib/IsLoadingOnboardingItem'

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
  activeTrigger,
}: {
  executeCompleteOnboarding: () => void
  activeTrigger: ActiveTrigger
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { playground, hasActiveStream, abortCurrentStream } = usePlayground()

  const handleNext = useCallback(() => {
    executeCompleteOnboarding()
    abortCurrentStream()
    redirect(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid }).preview.root,
    )
  }, [executeCompleteOnboarding, project, commit, abortCurrentStream])

  const containerRef = useRef<HTMLDivElement | null>(null)

  useAutoScroll(containerRef, { startAtBottom: true })

  const promptIsRunning = useMemo(() => {
    return playground.isLoading || !playground.error || !hasActiveStream()
  }, [playground.isLoading, playground.error, hasActiveStream])

  return (
    <OnboardingStep.Body>
      <div
        ref={containerRef}
        className='flex flex-col items-center gap-8 border-dashed border-2 rounded-xl p-2 w-full max-w-[600px] overflow-y-auto custom-scrollbar scrollable-indicator max-h-[400px] 2xl:max-h-[600px]'
      >
        {playground.messages.length === 0 && !playground.error ? (
          <IsLoadingOnboardingItem
            highlightedText='Your agent'
            nonHighlightedText='will start running in a moment...'
          />
        ) : (
          <>
            <Chat
              showHeader={false}
              playground={playground}
              parameters={activeTrigger.parameters}
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
        disabled={promptIsRunning}
      >
        Continue building
      </Button>
    </OnboardingStep.Body>
  )
}
