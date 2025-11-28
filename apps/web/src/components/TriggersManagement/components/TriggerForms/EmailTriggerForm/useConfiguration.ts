import { useCallback, useMemo, useRef, useState } from 'react'
import { useMetadataParameters } from '$/hooks/useMetadataParameters'
import useUsers from '$/stores/users'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentTriggerParameters } from '@latitude-data/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

export enum EmailAvailabilityOptions {
  Public = 'public',
  Private = 'private',
}

const AVAILABILITY_OPTIONS: Record<
  EmailAvailabilityOptions,
  { label: string }
> = {
  [EmailAvailabilityOptions.Private]: {
    label: 'Only selected emails and domains',
  },
  [EmailAvailabilityOptions.Public]: {
    label: 'Anyone with the email',
  },
}

export function useEmailTriggerConfiguration({
  document,
  emailTriggerConfig,
}: {
  document: DocumentVersion
  emailTriggerConfig?: EmailTriggerConfiguration
}) {
  const { data: users } = useUsers()
  const { parameters: documentParameters } = useMetadataParameters()
  const availabilityOptions = useMemo(
    () =>
      Object.entries(AVAILABILITY_OPTIONS).map(([key, value]) => ({
        value: key,
        label: value.label,
      })),
    [],
  )

  const emails = emailTriggerConfig?.emailWhitelist?.length ?? 0
  const domains = emailTriggerConfig?.domainWhitelist?.length ?? 0
  const emailsAndDomainsCount = emails + domains
  const [emailAvailability, _setEmailAvailability] =
    useState<EmailAvailabilityOptions>(
      !emailTriggerConfig
        ? EmailAvailabilityOptions.Private
        : emailsAndDomainsCount > 0
          ? EmailAvailabilityOptions.Private
          : EmailAvailabilityOptions.Public,
    )

  const userEmails = useMemo(() => users.map((u) => u.email), [users])
  const [emailWhitelist, setEmailWhitelist] = useState<string[]>(() => {
    const existingWhiteList = emailTriggerConfig?.emailWhitelist ?? []

    if (
      !existingWhiteList.length &&
      emailAvailability === EmailAvailabilityOptions.Public
    ) {
      return []
    }
    return existingWhiteList.length > 0 ? existingWhiteList : userEmails
  })

  const [domainWhitelist, setDomainWhitelist] = useState<string[]>([])
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

  const prevEmailWhiteList = useRef<string[]>(emailWhitelist)
  const setEmailEvailability = useCallback(
    (value: EmailAvailabilityOptions) => {
      _setEmailAvailability(value)
      setEmailInput('')

      if (value === EmailAvailabilityOptions.Private) {
        setDomainWhitelist([])
        setEmailWhitelist(prevEmailWhiteList.current)
      }
      if (value === EmailAvailabilityOptions.Public) {
        prevEmailWhiteList.current = emailWhitelist
        setEmailWhitelist([])
        setDomainWhitelist([])
      }
    },
    [emailWhitelist],
  )

  return useMemo(
    () => ({
      emailWhitelist,
      setEmailWhitelist,
      domainWhitelist,
      setDomainWhitelist,
      replyWithResponse,
      setReplyWithResponse,
      name,
      setName,
      parameters,
      setParameters,
      emailInput,
      setEmailInput,
      onAddEmail,
      emailAvailability,
      setEmailEvailability,
      availabilityOptions,
      documentParameters,
    }),
    [
      onAddEmail,
      setEmailEvailability,
      emailWhitelist,
      domainWhitelist,
      replyWithResponse,
      name,
      parameters,
      emailInput,
      emailAvailability,
      availabilityOptions,
      documentParameters,
    ],
  )
}

export type UseEmailTriggerConfiguration = ReturnType<
  typeof useEmailTriggerConfiguration
>
