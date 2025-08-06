import { useCallback } from 'react'
import useDocumentTriggers from '$/stores/documentTriggers'
import { ScheduleTriggerConfig } from './Configuration'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { OnTriggerCreated } from '../../../client'
import { type SavedConfig } from './Configuration/scheduleUtils'
import {
  SelectDocument,
  useDocumentSelection,
} from '../PipedreamTrigger/TriggerConfiguration/SelectDocument'
import { TriggerWrapper } from '../TriggerWrapper'

export function ScheduleTrigger({
  onTriggerCreated,
}: {
  onTriggerCreated: OnTriggerCreated
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const documentSelection = useDocumentSelection()
  const document = documentSelection.document
  const { create, isCreating } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      onCreated: (trigger) => {
        onTriggerCreated(trigger)
      },
    },
  )
  const documentUuid = document?.documentUuid
  const onSaveTrigger = useCallback(
    async (config: SavedConfig) => {
      if (!documentUuid) return

      create({
        documentUuid,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: config,
      })
    },
    [create, documentUuid],
  )

  return (
    <TriggerWrapper
      title='Schedule Trigger'
      description='Enables running this prompt in a fixed schedule. For example, once per day.'
    >
      <SelectDocument
        options={documentSelection.options}
        document={document}
        onSelectDocument={documentSelection.onSelectDocument}
      />
      {document ? (
        <ScheduleTriggerConfig
          onSaveTrigger={onSaveTrigger}
          isCreating={isCreating}
        />
      ) : null}
    </TriggerWrapper>
  )
}
