import useDocumentTriggers from '$/stores/documentTriggers'
import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useMemo } from 'react'
import { EmailTriggerConfig } from './Config'

export function EmailTriggerSettings({
  document,
  projectId,
  commitUuid,
}: {
  document: DocumentVersion
  projectId: number
  commitUuid: string
}) {
  const {
    data: documentTriggers,
    isLoading,
    create,
    isCreating,
    delete: deleteFn,
    isDeleting,
    update,
    isUpdating,
  } = useDocumentTriggers({
    projectId,
    commitUuid,
    documentUuid: document.documentUuid,
  })

  const emailTrigger = useMemo(
    () =>
      documentTriggers.find(
        (t) => t.triggerType === DocumentTriggerType.Email,
      ) as DocumentTrigger<DocumentTriggerType.Email> | undefined,
    [documentTriggers],
  )

  const onChangeConfig = useCallback(
    (config?: EmailTriggerConfiguration) => {
      if (!config) {
        if (!emailTrigger) return
        deleteFn(emailTrigger)
        return
      }

      if (emailTrigger) {
        update({
          documentTriggerUuid: emailTrigger.uuid,
          configuration: config,
        })
        return
      }

      create({
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Email,
        configuration: config,
      })
    },
    [emailTrigger, create, deleteFn, update, document.documentUuid],
  )

  const triggerEmailAddress = `${document.documentUuid}@${EMAIL_TRIGGER_DOMAIN}`

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5 color='foregroundMuted'>
        Enables running this prompt when a user sends an email to a specific
        address.
      </Text.H5>
      <EmailTriggerConfig
        emailTriggerConfig={emailTrigger?.configuration}
        triggerEmailAddress={triggerEmailAddress}
        onChangeConfig={onChangeConfig}
        isLoading={isLoading || isCreating || isUpdating || isDeleting}
      />
    </div>
  )
}
