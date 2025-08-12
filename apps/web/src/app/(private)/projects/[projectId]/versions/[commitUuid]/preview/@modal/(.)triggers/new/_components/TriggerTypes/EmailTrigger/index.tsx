import { useCallback } from 'react'
import useDocumentTriggers from '$/stores/documentTriggers'
import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { type OnTriggerCreated } from '../../../client'
import {
  SelectDocument,
  useDocumentSelection,
} from '../PipedreamTrigger/TriggerConfiguration/SelectDocument'
import { TriggerWrapper } from '../TriggerWrapper'
import { EmailTriggerConfig } from './Configuration'

export function EmailTrigger({
  onTriggerCreated,
}: {
  onTriggerCreated: OnTriggerCreated
}) {
  const { project } = useCurrentProject()
  const documentSelection = useDocumentSelection()
  const { isHead } = useCurrentCommit()
  const document = documentSelection.document
  const { create, isCreating } = useDocumentTriggers(
    {
      projectId: project.id,
    },
    {
      onCreated: (trigger) => {
        onTriggerCreated(trigger)
      },
    },
  )
  const disabled = isHead || isCreating
  const documentUuid = document?.documentUuid
  const onCreateEmailTrigger = useCallback(
    (config: EmailTriggerConfiguration) => {
      if (!documentUuid) return

      create({
        documentUuid,
        trigger: {
          type: DocumentTriggerType.Email,
          configuration: config,
        },
      })
    },
    [create, documentUuid],
  )

  const triggerEmailAddress = document
    ? `${document.documentUuid}@${EMAIL_TRIGGER_DOMAIN}`
    : null

  return (
    <TriggerWrapper
      title='Email Trigger'
      description='Enables running this prompt when a user sends an email to a specific address.'
    >
      <SelectDocument
        options={documentSelection.options}
        document={document}
        onSelectDocument={documentSelection.onSelectDocument}
      />
      {triggerEmailAddress && document ? (
        <EmailTriggerConfig
          document={document}
          triggerEmailAddress={triggerEmailAddress}
          onCreateEmailTrigger={onCreateEmailTrigger}
          isCreating={isCreating}
          disabled={disabled}
        />
      ) : null}
    </TriggerWrapper>
  )
}
