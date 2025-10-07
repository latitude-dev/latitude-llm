import { useCallback } from 'react'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useEmailTriggerConfiguration } from '$/components/TriggersManagement/components/TriggerForms/EmailTriggerForm/useConfiguration'
import {
  configureEmailAllowList,
  getEmailTriggerAddress,
} from '$/components/TriggersManagement/components/TriggerForms/EmailTriggerForm/utils'
import { EmailTriggerForm } from '$/components/TriggersManagement/components/TriggerForms/EmailTriggerForm'
import { DocumentVersion } from '@latitude-data/core/schema/types'

export function EmailTriggerConfig({
  document,
  emailTriggerConfig,
  onCreateEmailTrigger,
  isCreating,
  disabled,
}: {
  document: DocumentVersion
  emailTriggerConfig?: EmailTriggerConfiguration
  onCreateEmailTrigger: (config: EmailTriggerConfiguration) => void
  isCreating: boolean
  disabled: boolean
}) {
  const triggerEmailAddress = getEmailTriggerAddress(document)
  const config = useEmailTriggerConfiguration({ document, emailTriggerConfig })
  const onCreate = useCallback(() => {
    onCreateEmailTrigger({
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
    onCreateEmailTrigger,
  ])

  return (
    <>
      <EmailTriggerForm
        {...config}
        document={document}
        triggerEmailAddress={triggerEmailAddress}
        disabled={disabled}
      />
      <Button variant='default' fancy onClick={onCreate} disabled={disabled}>
        {isCreating ? 'Creating trigger...' : 'Create trigger'}
      </Button>
    </>
  )
}
