import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useMetadataParameters } from '$/hooks/useMetadataParameters'
import useUsers from '$/stores/users'
import { DocumentTriggerParameters } from '@latitude-data/constants'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CopyButton } from '@latitude-data/web-ui/atoms/CopyButton'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactNode, useCallback, useState } from 'react'

enum EmailAvailabilityOptions {
  Public = 'public',
  Private = 'private',
  Disabled = 'disabled',
}

const AVAILABILITY_OPTIONS: Record<
  EmailAvailabilityOptions,
  { label: string; icon: IconName }
> = {
  [EmailAvailabilityOptions.Disabled]: { label: 'Disabled', icon: 'close' },
  [EmailAvailabilityOptions.Private]: {
    label: 'Only selected emails and domains',
    icon: 'lock',
  },
  [EmailAvailabilityOptions.Public]: {
    label: 'Anyone with the email',
    icon: 'globe',
  },
}

function Whitelist({
  items,
  icon,
  onRemove,
}: {
  items: string[]
  icon: IconName
  onRemove: (item: string) => void
}) {
  if (!items.length) return null
  return items.map((item, idx) => (
    <div className='flex w-full items-center gap-2 pl-4' key={idx}>
      <Icon name={icon} color='foregroundMuted' />
      <div className='flex w-full items-center'>
        <Text.H6 key={item} color='foregroundMuted'>
          {item}
        </Text.H6>
      </div>
      <Button
        variant='ghost'
        onClick={() => onRemove(item)}
        iconProps={{ name: 'close' }}
      />
    </div>
  ))
}

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
  return (
    <div className='flex flex-col gap-2'>
      {parameterNames.map((paramName) => {
        const value = parameters[paramName]

        return (
          <div className='flex gap-2 items-center' key={paramName}>
            <Badge
              variant={value ? 'accent' : 'muted'}
              noWrap
              ellipsis
              className='min-w-24'
            >
              {`{{${paramName}}}`}
            </Badge>
            <Select
              name={paramName}
              options={Object.entries(PARAMETER_OPTIONS).map(
                ([key, value]) => ({
                  value: key,
                  label: value,
                }),
              )}
              disabled={disabled}
              value={value}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-2'>
      <Text.H5B>{title}</Text.H5B>
      {children}
    </div>
  )
}

export function EmailTriggerConfig({
  emailTriggerConfig,
  triggerEmailAddress,
  onChangeConfig,
  isLoading,
}: {
  emailTriggerConfig?: EmailTriggerConfiguration
  triggerEmailAddress: string
  onChangeConfig: (config?: EmailTriggerConfiguration) => void
  isLoading: boolean
}) {
  const { data: users } = useUsers()

  const { document } = useCurrentDocument()

  const { parameters: documentParameters } = useMetadataParameters()

  const disabled = isLoading

  const [emailWhitelist, setEmailWhitelist] = useState<string[]>(
    emailTriggerConfig?.emailWhitelist ?? [],
  )
  const [domainWhitelist, setDomainWhitelist] = useState<string[]>(
    emailTriggerConfig?.domainWhitelist ?? [],
  )
  const [replyWithResponse, setReplyWithResponse] = useState<boolean>(
    emailTriggerConfig?.replyWithResponse ?? true,
  )
  const [name, setName] = useState<string>(
    emailTriggerConfig?.name ?? document.path.split('/').at(-1)!,
  )
  const [parameters, setParameters] = useState<
    Record<string, DocumentTriggerParameters>
  >(emailTriggerConfig?.parameters ?? {})

  const [emailInput, setEmailInput] = useState('')
  const onAddEmail = useCallback(() => {
    let value = emailInput.trim()
    if (value.startsWith('@')) value = value.slice(1)

    if (value.length === 0) return
    const isDomain = !value.includes('@')
    if (isDomain) {
      setDomainWhitelist((prev) => [...prev, value])
    } else {
      setEmailWhitelist((prev) => [...prev, value])
    }
    setEmailInput('')
  }, [emailInput])

  const [emailAvailability, _setEmailAvailability] =
    useState<EmailAvailabilityOptions>(
      emailTriggerConfig
        ? (emailTriggerConfig.emailWhitelist?.length ?? 0) +
            (emailTriggerConfig.domainWhitelist?.length ?? 0) >
          0
          ? EmailAvailabilityOptions.Private
          : EmailAvailabilityOptions.Public
        : EmailAvailabilityOptions.Disabled,
    )

  const setEmailEvailability = useCallback(
    (value: EmailAvailabilityOptions) => {
      _setEmailAvailability(value)
      setEmailInput('')
      if (value === EmailAvailabilityOptions.Private) {
        setDomainWhitelist([])
        setEmailWhitelist(users.map((u) => u.email))
      }
      if (value === EmailAvailabilityOptions.Public) {
        setEmailWhitelist([])
        setDomainWhitelist([])
      }
    },
    [users],
  )

  const onSaveChange = useCallback(() => {
    if (emailAvailability === EmailAvailabilityOptions.Disabled) {
      onChangeConfig(undefined)
      return
    }
    onChangeConfig({
      emailWhitelist: emailWhitelist.length > 0 ? emailWhitelist : undefined,
      domainWhitelist: domainWhitelist.length > 0 ? domainWhitelist : undefined,
      replyWithResponse,
      parameters,
      name,
    })
  }, [
    emailWhitelist,
    domainWhitelist,
    replyWithResponse,
    parameters,
    emailAvailability,
    name,
    onChangeConfig,
  ])

  return (
    <div className='flex flex-col gap-6'>
      <Section title='Access'>
        <Select
          disabled={disabled}
          name='availability'
          options={Object.entries(AVAILABILITY_OPTIONS).map(([key, value]) => ({
            value: key,
            label: value.label,
            icon: <Icon name={value.icon} />,
          }))}
          value={emailAvailability}
          onChange={(value) =>
            setEmailEvailability(value as EmailAvailabilityOptions)
          }
        />
        {emailAvailability === EmailAvailabilityOptions.Private && (
          <div className='flex flex-col gap-2'>
            <div className='flex gap-2'>
              <Input
                name='email'
                placeholder='Email or domain'
                value={emailInput}
                disabled={disabled}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAddEmail()}
              />
              <Button
                variant='outline'
                fancy
                onClick={onAddEmail}
                disabled={emailInput.trim().length === 0 || disabled}
              >
                Add
              </Button>
            </div>
            <Whitelist
              items={emailWhitelist}
              icon='circleUser'
              onRemove={(item) =>
                setEmailWhitelist((prev) => prev.filter((e) => e !== item))
              }
            />
            <Whitelist
              items={domainWhitelist}
              icon='atSign'
              onRemove={(item) =>
                setDomainWhitelist((prev) => prev.filter((e) => e !== item))
              }
            />
            {!emailWhitelist.length && !domainWhitelist.length && (
              <Text.H6 color='foregroundMuted'>
                No emails or domains added to the whitelist
              </Text.H6>
            )}
          </div>
        )}
      </Section>
      {emailAvailability !== EmailAvailabilityOptions.Disabled && (
        <>
          {!!documentParameters.length && (
            <Section title='Parameters'>
              <ParameterSelects
                parameterNames={documentParameters}
                parameters={parameters}
                setParameters={setParameters}
                disabled={disabled}
              />
            </Section>
          )}
          <Section title='Email settings'>
            <Input
              name='emailName'
              label='Name'
              value={name}
              disabled={disabled}
              onChange={(e) => setName(e.target.value)}
              placeholder={document.path.split('/').at(-1)}
            />
            <Text.H5 color='foregroundMuted'>
              Send an email to this address to run the prompt:
            </Text.H5>
            <div className='flex flex-row border border-border rounded-md w-full'>
              <div className='flex w-full truncate p-2'>
                <Text.H6 color='foregroundMuted' noWrap ellipsis>
                  {triggerEmailAddress}
                </Text.H6>
              </div>
              <div className='w-10 h-8 flex items-center justify-center bg-muted border-l border-border'>
                <Button variant='ghost'>
                  <CopyButton content={triggerEmailAddress} />
                </Button>
              </div>
            </div>
            <div className='flex gap-2 justify-between'>
              <Text.H5>Reply with response</Text.H5>
              <SwitchToggle
                disabled={disabled}
                checked={replyWithResponse}
                onClick={() => setReplyWithResponse((prev) => !prev)}
              />
            </div>
          </Section>
        </>
      )}
      <div className='flex justify-end'>
        <Button
          variant='default'
          fancy
          onClick={onSaveChange}
          isLoading={isLoading}
          disabled={disabled}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}
