import { envClient } from '$/envClient'
import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentVersion } from '@latitude-data/core/browser'
import { EmailTriggerConfiguration } from '@latitude-data/core/services/documentTriggers/helpers/schema'
import { Text } from '@latitude-data/web-ui'
import { useCallback, useMemo } from 'react'
import { EmailTriggerConfig } from './Config'

export function EmailTriggerSettings({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
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
    documentUuid: document.documentUuid,
  })

  const emailTrigger = useMemo(
    () =>
      documentTriggers.find((t) => t.triggerType === DocumentTriggerType.Email),
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
          documentTrigger: emailTrigger,
          configuration: config,
        })
        return
      }

      create({
        triggerType: DocumentTriggerType.Email,
        configuration: config,
      })
    },
    [emailTrigger, create, deleteFn, update],
  )

  const triggerEmailAddress = `${document.documentUuid}@${envClient.NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN ?? 'env.not.configured'}`

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
