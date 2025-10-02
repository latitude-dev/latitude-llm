import { useCallback } from 'react'
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

export function RunAgentStep({
  moveNextOnboardingStep,
  activeTrigger,
  playground,
}: {
  moveNextOnboardingStep: () => void
  activeTrigger: ActiveTrigger
  playground: ReturnType<typeof usePlaygroundChat>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const handleNext = useCallback(() => {
    moveNextOnboardingStep()
    redirect(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid }).preview.root,
    )
  }, [moveNextOnboardingStep, project, commit])

  return (
    <div className='flex flex-col items-center p-32 gap-10'>
      <div className='flex flex-col items-center gap-2'>
        <div className='p-2 rounded-lg bg-success-muted'>
          <Icon name='checkClean' size='medium' />
        </div>
        <Text.H2M color='foreground' noWrap>
          Done!
        </Text.H2M>
        <Text.H5 color='foregroundMuted'>Your agent is ready-to-go!</Text.H5>
      </div>
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2 w-full max-w-[600px]'>
        <Chat
          showHeader={false}
          playground={playground}
          parameters={activeTrigger.parameters}
        />
      </div>
      <Button
        fancy
        onClick={handleNext}
        iconProps={{ name: 'chevronRight', placement: 'right' }}
      >
        Continue building
      </Button>
    </div>
  )
}
