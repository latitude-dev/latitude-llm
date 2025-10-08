import { useMemo } from 'react'
import { DocumentTriggerParameters } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { CopyButton } from '@latitude-data/web-ui/atoms/CopyButton'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { RadioButtonsInput } from '@latitude-data/web-ui/atoms/RadioButtonsInput'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Select } from '@latitude-data/web-ui/atoms/Select'

import { EmailsWhitelist } from './EmailsWhitelist'
import {
  EmailAvailabilityOptions,
  UseEmailTriggerConfiguration,
} from './useConfiguration'
import { DocumentVersion } from '@latitude-data/core/schema/types'

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

export function EmailTriggerForm({
  document,
  triggerEmailAddress,
  disabled = false,
  availabilityOptions,
  emailAvailability,
  setEmailEvailability,
  setEmailWhitelist,
  setDomainWhitelist,
  domainWhitelist,
  emailWhitelist,
  setReplyWithResponse,
  setName,
  name,
  emailInput,
  replyWithResponse,
  setEmailInput,
  onAddEmail,
  documentParameters,
  parameters,
  setParameters,
}: {
  document: DocumentVersion
  triggerEmailAddress: string
  disabled?: boolean
  availabilityOptions: UseEmailTriggerConfiguration['availabilityOptions']
  emailAvailability: UseEmailTriggerConfiguration['emailAvailability']
  setEmailEvailability: UseEmailTriggerConfiguration['setEmailEvailability']
  setEmailWhitelist: UseEmailTriggerConfiguration['setEmailWhitelist']
  domainWhitelist: UseEmailTriggerConfiguration['domainWhitelist']
  emailWhitelist: UseEmailTriggerConfiguration['emailWhitelist']
  setDomainWhitelist: UseEmailTriggerConfiguration['setDomainWhitelist']
  setReplyWithResponse: UseEmailTriggerConfiguration['setReplyWithResponse']
  name: UseEmailTriggerConfiguration['name']
  setName: UseEmailTriggerConfiguration['setName']
  emailInput: UseEmailTriggerConfiguration['emailInput']
  setEmailInput: UseEmailTriggerConfiguration['setEmailInput']
  replyWithResponse: UseEmailTriggerConfiguration['replyWithResponse']
  onAddEmail: UseEmailTriggerConfiguration['onAddEmail']
  parameters: UseEmailTriggerConfiguration['parameters']
  documentParameters: UseEmailTriggerConfiguration['documentParameters']
  setParameters: UseEmailTriggerConfiguration['setParameters']
}) {
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
    </>
  )
}
