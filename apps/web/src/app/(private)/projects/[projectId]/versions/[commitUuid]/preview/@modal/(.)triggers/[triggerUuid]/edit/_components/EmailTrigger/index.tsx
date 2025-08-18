import { useEffect } from 'react'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  configureEmailAllowList,
  getEmailTriggerAddress,
} from '../../../../_components/TriggerForms/EmailTriggerForm/utils'
import { useEmailTriggerConfiguration } from '../../../../_components/TriggerForms/EmailTriggerForm/useConfiguration'
import { EmailTriggerForm } from '../../../../_components/TriggerForms/EmailTriggerForm'
import type { EditTriggerProps } from '../../EditTriggerModal'

export function EditEmailTrigger({
  trigger,
  document,
  setConfiguration,
  isUpdating,
}: EditTriggerProps<DocumentTriggerType.Email>) {
  const triggerEmailAddress = getEmailTriggerAddress(document)
  const config = useEmailTriggerConfiguration({
    document,
    emailTriggerConfig: trigger.configuration,
  })

  useEffect(() => {
    setConfiguration({
      ...configureEmailAllowList({
        emailAvailability: config.emailAvailability,
        emailWhitelist: config.emailWhitelist,
        domainWhitelist: config.domainWhitelist,
      }),
      replyWithResponse: config.replyWithResponse,
      parameters: config.parameters,
      name: config.name,
    })
  }, [
    config.emailAvailability,
    config.emailWhitelist,
    config.domainWhitelist,
    config.replyWithResponse,
    config.parameters,
    config.name,
    setConfiguration,
  ])

  return (
    <EmailTriggerForm
      {...config}
      document={document}
      triggerEmailAddress={triggerEmailAddress}
      disabled={isUpdating}
    />
  )
}
