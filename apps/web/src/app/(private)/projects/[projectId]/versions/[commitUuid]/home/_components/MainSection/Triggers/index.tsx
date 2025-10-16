import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentTriggers from '$/stores/documentTriggers'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { NewTriggerButton } from './NewTriggerButton'
import { useCallback } from 'react'
import useDocumentVersions from '$/stores/documentVersions'
import { RunTriggerProps } from '$/components/TriggersManagement/types'
import { RunProps } from '$/components/Agent/types'
import { TriggersList } from '$/components/TriggersManagement/TriggerCard/TriggerList'

export function TriggersSection({
  runPromptFn,
}: {
  runPromptFn: (props: RunProps) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: triggers } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const { data: documents } = useDocumentVersions({
    projectId: commit.projectId,
    commitUuid: commit.uuid,
  })

  const onRunTrigger = useCallback(
    ({ trigger, parameters, userMessage, aiParameters }: RunTriggerProps) => {
      const document = documents?.find(
        (d) => d.documentUuid === trigger.documentUuid,
      )
      if (!document) return

      runPromptFn({
        trigger,
        document,
        parameters,
        userMessage: userMessage ?? '',
        aiParameters: aiParameters ?? false,
      })
    },
    [runPromptFn, documents],
  )

  return (
    <div className='w-full flex flex-col gap-6 items-center'>
      <Text.H5 color='foregroundMuted'>
        {triggers.length > 0
          ? 'or run a preview from a trigger'
          : 'or add a trigger to run this project automatically'}
      </Text.H5>
      <TriggersList
        triggers={triggers}
        commit={commit}
        handleRun={onRunTrigger}
      />
      <NewTriggerButton />
    </div>
  )
}
