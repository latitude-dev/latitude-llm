import { Fragment, useCallback, useRef, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Chat from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { ActiveTrigger } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersList'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'

export function RunAgentIconAndTitle({
  playground,
  hasActiveStream,
}: {
  playground: ReturnType<typeof usePlaygroundChat>
  hasActiveStream: () => boolean
}) {
  const promptIsRunning = useMemo(() => {
    return playground.isLoading || !!playground.error || !hasActiveStream()
  }, [playground.isLoading, playground.error, hasActiveStream])

  return (
    <Fragment>
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
    </Fragment>
  )
}

export function RunAgentContent({
  executeCompleteOnboarding,
  activeTrigger,
  playground,
  hasActiveStream,
}: {
  executeCompleteOnboarding: () => void
  activeTrigger: ActiveTrigger
  playground: ReturnType<typeof usePlaygroundChat>
  hasActiveStream: () => boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const handleNext = useCallback(() => {
    executeCompleteOnboarding()
    redirect(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid }).preview.root,
    )
  }, [executeCompleteOnboarding, project, commit])

  const containerRef = useRef<HTMLDivElement | null>(null)

  useAutoScroll(containerRef, { startAtBottom: true })

  const promptIsRunning = useMemo(() => {
    return playground.isLoading || !!playground.error || !hasActiveStream()
  }, [playground.isLoading, playground.error, hasActiveStream])

  return (
    <Fragment>
      <div
        ref={containerRef}
        className='flex flex-col items-center gap-8 border-dashed border-2 rounded-xl p-2 w-full max-w-[600px] overflow-y-auto custom-scrollbar scrollable-indicator max-h-[400px] 2xl:max-h-[600px]'
      >
        {/* TODO(onboarding): Add loading state */}
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
      </div>
      <Button
        fancy
        onClick={handleNext}
        iconProps={{ name: 'chevronRight', placement: 'right' }}
        disabled={promptIsRunning}
      >
        Continue building
      </Button>
    </Fragment>
  )
}
