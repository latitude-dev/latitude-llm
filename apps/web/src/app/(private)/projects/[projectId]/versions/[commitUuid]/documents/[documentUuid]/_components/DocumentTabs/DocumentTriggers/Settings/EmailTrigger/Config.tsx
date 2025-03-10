import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useUsers from '$/stores/users'
import { EmailTriggerConfiguration } from '@latitude-data/core/services/documentTriggers/helpers/schema'
import {
  Badge,
  Button,
  CopyButton,
  Icon,
  IconName,
  Input,
  Select,
  SwitchToogle,
  Text,
  useCurrentCommit,
} from '@latitude-data/web-ui'
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

enum ParameterType {
  Subject = 'subject',
  Content = 'content',
  Sender = 'sender',
}

const PARAMETER_OPTIONS: Record<ParameterType, string> = {
  [ParameterType.Subject]: 'Email Subject',
  [ParameterType.Content]: 'Email Content',
  [ParameterType.Sender]: 'Sender Email',
}

function ParameterSelects({
  parameters,
  subjectParameters: [subjectParameters, setSubjectParameters],
  contentParameters: [contentParameters, setContentParameters],
  senderParameters: [senderParameters, setSenderParameters],
  disabled,
}: {
  parameters: string[]
  subjectParameters: [string[], (value: string[]) => void]
  contentParameters: [string[], (value: string[]) => void]
  senderParameters: [string[], (value: string[]) => void]
  disabled: boolean
}) {
  return (
    <div className='flex flex-col gap-2'>
      {parameters.map((paramName) => {
        const value: ParameterType | undefined = subjectParameters.includes(
          paramName,
        )
          ? ParameterType.Subject
          : contentParameters.includes(paramName)
            ? ParameterType.Content
            : senderParameters.includes(paramName)
              ? ParameterType.Sender
              : undefined

        return (
          <div className='flex gap-2 items-center' key={paramName}>
            <Badge
              variant={value ? 'accent' : 'muted'}
            >{`{{${paramName}}}`}</Badge>
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
                if (value === ParameterType.Subject) {
                  setSubjectParameters(
                    subjectParameters.filter((e) => e !== paramName),
                  )
                }
                if (value === ParameterType.Content) {
                  setContentParameters(
                    contentParameters.filter((e) => e !== paramName),
                  )
                }
                if (value === ParameterType.Sender) {
                  setSenderParameters(
                    senderParameters.filter((e) => e !== paramName),
                  )
                }
                if (newValue === ParameterType.Subject) {
                  setSubjectParameters([...subjectParameters, paramName])
                }
                if (newValue === ParameterType.Content) {
                  setContentParameters([...contentParameters, paramName])
                }
                if (newValue === ParameterType.Sender) {
                  setSenderParameters([...senderParameters, paramName])
                }
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
  const { commit, isHead } = useCurrentCommit()
  const canEdit = isHead && !isLoading

  const {
    manual: { inputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const documentParameters = Object.keys(inputs)

  const [emailWhitelist, setEmailWhitelist] = useState<string[]>(
    emailTriggerConfig?.emailWhitelist ?? [],
  )
  const [domainWhitelist, setDomainWhitelist] = useState<string[]>(
    emailTriggerConfig?.domainWhitelist ?? [],
  )
  const [replyWithResponse, setReplyWithResponse] = useState<boolean>(
    emailTriggerConfig?.replyWithResponse ?? true,
  )
  const [subjectParameters, setSubjectParameters] = useState<
    string[] | undefined
  >(emailTriggerConfig?.subjectParameters)
  const [contentParameters, setContentParameters] = useState<
    string[] | undefined
  >(emailTriggerConfig?.contentParameters)
  const [senderParameters, setSenderParameters] = useState<
    string[] | undefined
  >(emailTriggerConfig?.senderParameters)

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
      subjectParameters: subjectParameters?.length
        ? subjectParameters
        : undefined,
      contentParameters: contentParameters?.length
        ? contentParameters
        : undefined,
      senderParameters: senderParameters?.length ? senderParameters : undefined,
    })
  }, [
    emailWhitelist,
    domainWhitelist,
    replyWithResponse,
    subjectParameters,
    contentParameters,
    senderParameters,
    emailAvailability,
  ])

  return (
    <div className='flex flex-col gap-6'>
      <Section title='Access'>
        <Select
          disabled={!canEdit}
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
                disabled={!canEdit}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAddEmail()}
              />
              <Button
                variant='outline'
                fancy
                onClick={onAddEmail}
                disabled={emailInput.trim().length === 0 || !canEdit}
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
          <Section title='Parameters'>
            <ParameterSelects
              parameters={documentParameters}
              subjectParameters={[
                subjectParameters ?? [],
                setSubjectParameters,
              ]}
              contentParameters={[
                contentParameters ?? [],
                setContentParameters,
              ]}
              senderParameters={[senderParameters ?? [], setSenderParameters]}
              disabled={!canEdit}
            />
          </Section>
          <Section title='Email settings'>
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
              <SwitchToogle
                disabled={!canEdit}
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
          disabled={!canEdit}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}
