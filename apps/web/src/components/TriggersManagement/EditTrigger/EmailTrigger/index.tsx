import { useEffect } from 'react'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  configureEmailAllowList,
  getEmailTriggerAddress,
} from '$/components/TriggersManagement/components/TriggerForms/EmailTriggerForm/utils'
import { useEmailTriggerConfiguration } from '$/components/TriggersManagement/components/TriggerForms/EmailTriggerForm/useConfiguration'
import { EmailTriggerForm } from '$/components/TriggersManagement/components/TriggerForms/EmailTriggerForm'
import type { EditTriggerProps } from '../../types'

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
  const setParameters = config.setParameters

  useEffect(() => {
    if (document.documentUuid !== trigger.documentUuid) {
      setParameters({})
    }
  }, [document.documentUuid, trigger.documentUuid, setParameters])

  return (
    <EmailTriggerForm
      {...config}
      document={document}
      triggerEmailAddress={triggerEmailAddress}
      disabled={isUpdating}
    />
  )
}
