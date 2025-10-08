import { useCallback } from 'react'
import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { type OnTriggerCreated } from '../../../types'
import {
  SelectDocument,
  useDocumentSelection,
} from '../../../components/SelectDocument'
import { TriggerWrapper } from '../TriggerWrapper'
import { EmailTriggerConfig } from './Configuration'
import { DocumentVersion } from '@latitude-data/core/schema/types'

export function EmailTrigger({
  onTriggerCreated,
  document: initialDocument,
}: {
  onTriggerCreated: OnTriggerCreated
  document?: DocumentVersion
}) {
  const { project } = useCurrentProject()
  const documentSelection = useDocumentSelection({
    initialDocumentUuid: initialDocument?.documentUuid,
  })
  const { commit } = useCurrentCommit()
  const document = documentSelection.document
  const { create, isCreating } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: initialDocument?.documentUuid,
    },
    {
      onCreated: (trigger) => {
        onTriggerCreated(trigger)
      },
    },
  )
  const disabled = !!commit.mergedAt || isCreating
  const documentUuid = document?.documentUuid
  const onCreateEmailTrigger = useCallback(
    (config: EmailTriggerConfiguration) => {
      if (!documentUuid) return

      create({
        documentUuid,
        triggerType: DocumentTriggerType.Email,
        configuration: config,
      })
    },
    [create, documentUuid],
  )

  return (
    <TriggerWrapper
      title='Email Trigger'
      description='Enables running this prompt when a user sends an email to a specific address.'
    >
      <SelectDocument
        options={documentSelection.options}
        document={document}
        onSelectDocument={documentSelection.onSelectDocument}
        disabled={!!initialDocument}
      />
      {document ? (
        <EmailTriggerConfig
          document={document}
          onCreateEmailTrigger={onCreateEmailTrigger}
          isCreating={isCreating}
          disabled={disabled}
        />
      ) : null}
    </TriggerWrapper>
  )
}
