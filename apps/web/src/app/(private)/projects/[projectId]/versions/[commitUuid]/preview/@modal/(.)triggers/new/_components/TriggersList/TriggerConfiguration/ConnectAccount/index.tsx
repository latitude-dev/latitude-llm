import { useCallback, useMemo, useState } from 'react'
import { AppDto, IntegrationDto } from '@latitude-data/core/browser'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IntegrationType } from '@latitude-data/constants'
import {
  Select,
  type SelectOption,
  type SelectProps,
} from '@latitude-data/web-ui/atoms/Select'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import useIntegrations from '$/stores/integrations'
import { PipedreamConnect } from './PipedreamConnect'

function useConnectedPipedreamAccounts({
  pipedreamSlug,
}: {
  account?: IntegrationDto
  pipedreamSlug: string
}) {
  const { data: integrations, isLoading } = useIntegrations({
    withTriggers: true,
  })
  return useMemo(() => {
    const accounts = integrations.filter(
      (integration) =>
        integration.type === IntegrationType.Pipedream &&
        integration.configuration.appName === pipedreamSlug,
    )
    const options = accounts.map<SelectOption<number>>((account) => ({
      value: account.id,
      label: account.name,
    }))
    return { accounts, options, isLoading }
  }, [integrations, pipedreamSlug, isLoading])
}

export function ConnectAccount({
  pipedreamApp,
  setAccount,
  account,
}: {
  pipedreamApp: AppDto
  setAccount: ReactStateDispatch<IntegrationDto | undefined>
  account?: IntegrationDto
}) {
  const [showConnect, setShowConnect] = useState(false)
  const { options, accounts, isLoading } = useConnectedPipedreamAccounts({
    pipedreamSlug: pipedreamApp.name_slug,
  })
  const onSelectAccount = useCallback(
    (accountId: number) => {
      const account = accounts.find((a) => a.id === +accountId)
      if (!account) return

      setAccount(account)
    },
    [accounts, setAccount],
  )
  const createNewAccountAction = useMemo<SelectProps['footerAction']>(
    () => ({
      icon: 'plus',
      label: 'Connect a new account',
      onClick: () => setShowConnect(true),
    }),
    [setShowConnect],
  )

  const onCancel = useCallback(() => {
    setShowConnect(false)
    setAccount(undefined)
  }, [setAccount])

  const onConnect = useCallback(
    (newAccount: IntegrationDto) => {
      setAccount(newAccount)
      setShowConnect(false)
    },
    [setAccount],
  )
  const showConnectAccount =
    (!isLoading && accounts.length === 0) || showConnect

  return (
    <FormFieldGroup
      label='Connected Account'
      description='Connect an account to use a trigger'
      descriptionPosition='top'
      layout='horizontal'
    >
      {showConnectAccount ? (
        <PipedreamConnect
          app={pipedreamApp}
          onAccountConnected={onConnect}
          onCancel={onCancel}
          showCancel={options.length > 0}
        />
      ) : (
        <Select<number>
          name='connect-account'
          searchable
          value={account ? account.id : undefined}
          options={options}
          onChange={onSelectAccount}
          placeholder='Select an account'
          loading={isLoading}
          disabled={isLoading}
          footerAction={createNewAccountAction}
        />
      )}
    </FormFieldGroup>
  )
}
