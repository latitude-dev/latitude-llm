import { useCallback, useMemo } from 'react'
import { DocumentTriggerParameters } from '@latitude-data/constants'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentVersion } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { CopyButton } from '@latitude-data/web-ui/atoms/CopyButton'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { RadioButtonsInput } from '@latitude-data/web-ui/atoms/RadioButtonsInput'
import { EmailsWhitelist } from './EmailsWhitelist'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import {
  EmailAvailabilityOptions,
  useEmailTriggerConfiguration,
} from './useConfiguration'

const PARAMETER_OPTIONS: Record<DocumentTriggerParameters, string> = {
  [DocumentTriggerParameters.SenderName]: 'Sender Name',
  [DocumentTriggerParameters.SenderEmail]: 'Sender Email',
  [DocumentTriggerParameters.Subject]: 'Email Subject',
  [DocumentTriggerParameters.Body]: 'Email Content',
  [DocumentTriggerParameters.Attachments]: 'Attachments',
}

function ParameterSelects({
  parameterNames,
  parameters,
  setParameters,
  disabled,
}: {
  parameterNames: string[]
  parameters: Record<string, DocumentTriggerParameters>
  setParameters: (params: Record<string, DocumentTriggerParameters>) => void
  disabled: boolean
}) {
  const options = useMemo(
    () =>
      Object.entries(PARAMETER_OPTIONS).map(([key, value]) => ({
        value: key,
        label: value,
      })),
    [],
  )
  return (
    <div className='w-full grid grid-cols-[auto_1fr] gap-y-3'>
      {parameterNames.map((paramName) => {
        const value = parameters[paramName]
        return (
          <div
            key={paramName}
            className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
          >
            <div className='flex flex-row items-center min-h-8'>
              <Badge
                variant={value ? 'accent' : 'muted'}
                noWrap
                ellipsis
                className='min-w-24'
              >
                {`{{${paramName}}}`}
              </Badge>
            </div>
            <Select
              name={paramName}
              options={options}
              disabled={disabled}
              value={value ?? ''}
              onChange={(newValue) => {
                if (value === newValue) return
                setParameters({
                  ...parameters,
                  [paramName]: newValue as DocumentTriggerParameters,
                })
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export function EmailTriggerConfig({
  document,
  triggerEmailAddress,
  emailTriggerConfig,
  onCreateEmailTrigger,
  isCreating,
  disabled,
}: {
  document: DocumentVersion
  triggerEmailAddress: string
  emailTriggerConfig?: EmailTriggerConfiguration
  onCreateEmailTrigger: (config: EmailTriggerConfiguration) => void
  isCreating: boolean
  disabled: boolean
}) {
  const {
    availabilityOptions,
    emailAvailability,
    setEmailEvailability,

    emailWhitelist,
    setEmailWhitelist,

    domainWhitelist,
    setDomainWhitelist,

    replyWithResponse,
    setReplyWithResponse,

    name,
    setName,

    emailInput,
    setEmailInput,
    onAddEmail,

    documentParameters,
    parameters,
    setParameters,
  } = useEmailTriggerConfiguration({ document, emailTriggerConfig })
  const onSaveChange = useCallback(() => {
    const isPrivate = emailAvailability === EmailAvailabilityOptions.Private
    // If emailAvailability is public we set emailWhitelist and domainWhitelist to undefined
    // It's a weird api imo. But if you go to documentTriggers/handlers/emails/index.ts
    // you will see that's what's check to allow receiving email to hit this email trigger
    onCreateEmailTrigger({
      emailWhitelist: isPrivate
        ? emailWhitelist.length > 0
          ? emailWhitelist
          : undefined
        : undefined,
      domainWhitelist: isPrivate
        ? domainWhitelist.length > 0
          ? domainWhitelist
          : undefined
        : undefined,
      replyWithResponse,
      parameters,
      name,
    })
  }, [
    emailAvailability,
    emailWhitelist,
    domainWhitelist,
    replyWithResponse,
    parameters,
    name,
    onCreateEmailTrigger,
  ])

  return (
    <>
      <Alert
        variant='default'
        title='Email address'
        description={
          <div className='flex flex-row items-center gap-x-2'>
            <Text.Mono>{triggerEmailAddress}</Text.Mono>
            <CopyButton content={triggerEmailAddress} />
          </div>
        }
      />
      <Input
        name='emailName'
        label='Name'
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        placeholder={document.path.split('/').at(-1)}
      />
      <>
        {!!documentParameters.length && (
          <FormFieldGroup
            label='Parameters'
            description='Match parameters in your prompt with info from the incoming email'
          >
            <ParameterSelects
              parameterNames={documentParameters}
              parameters={parameters}
              setParameters={setParameters}
              disabled={disabled}
            />
          </FormFieldGroup>
        )}
      </>
      <SwitchInput
        disabled={disabled}
        label='Reply with response'
        checked={replyWithResponse}
        onCheckedChange={setReplyWithResponse}
      />
      <RadioButtonsInput
        disabled={disabled}
        label='Email access'
        description='Who can send emails to this address?'
        name='availability'
        options={availabilityOptions}
        value={emailAvailability}
        onChange={(value) =>
          setEmailEvailability(value as EmailAvailabilityOptions)
        }
      />
      {emailAvailability === EmailAvailabilityOptions.Private && (
        <EmailsWhitelist
          disabled={disabled}
          emailInput={emailInput}
          setEmailInput={setEmailInput}
          onAddEmail={onAddEmail}
          emailWhitelist={emailWhitelist}
          setEmailWhitelist={setEmailWhitelist}
          domainWhitelist={domainWhitelist}
          setDomainWhitelist={setDomainWhitelist}
        />
      )}

      <Button
        variant='default'
        fancy
        onClick={onSaveChange}
        disabled={disabled}
      >
        {isCreating ? 'Creating trigger...' : 'Create trigger'}
      </Button>
    </>
  )
}
