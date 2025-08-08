import { useCallback, useMemo, useState } from 'react'
import { AppDto, IntegrationDto } from '@latitude-data/core/browser'
import useIntegrations from '$/stores/integrations'
import { IntegrationType } from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Select, type SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { ConnectAccount } from '../ConnectAccount'
import { type Trigger } from '../index'

const CREATE_ACCOUNT_ID = 'create_account'
function useConnectedPipedreamAccounts({
  pipedreamSlug,
}: {
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
    const options = accounts.map<SelectOption<string>>((account) => ({
      value: String(account.id),
      label: account.name,
    }))
    options.push({
      icon: 'plus',
      value: CREATE_ACCOUNT_ID,
      label: 'Connect a new account',
    })
    return { accounts, options, isLoading }
  }, [integrations, pipedreamSlug, isLoading])
}

export function TriggerConfiguration({
  trigger,
  pipedreamApp,
}: {
  trigger: Trigger
  pipedreamApp: AppDto
}) {
  const [_account, setAccount] = useState<IntegrationDto | undefined>(undefined)
  const [choosedConnect, setChoosedConnect] = useState(false)
  const { options, accounts, isLoading } = useConnectedPipedreamAccounts({
    pipedreamSlug: pipedreamApp.name_slug,
  })

  const onSelectAccount = useCallback(
    (accountId: string) => {
      if (accountId === CREATE_ACCOUNT_ID) {
        setChoosedConnect(true)
        return
      }

      const account = accounts.find((a) => a.id === +accountId)
      if (!account) return

      setAccount(account)
    },
    [accounts],
  )

  const onCancel = useCallback(() => {
    setChoosedConnect(false)
    setAccount(undefined)
  }, [])
  const showConnectAccount =
    (!isLoading && accounts.length === 0) || choosedConnect

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-col'>
        <Text.H7 uppercase>new trigger</Text.H7>
        <Text.H4>{trigger.name}</Text.H4>
        <Text.H5 color='foregroundMuted' lineClamp={2}>
          {trigger.description}
        </Text.H5>
        <hr className='border-t border-border mt-3' />
      </div>
      <FormFieldGroup
        label='Connected Account'
        description='Connect an account to use a trigger'
        descriptionPosition='top'
        layout='horizontal'
      >
        {showConnectAccount ? (
          <ConnectAccount
            app={pipedreamApp}
            onAccountConnected={setAccount}
            onCancel={onCancel}
          />
        ) : (
          <Select<string>
            name='connect-account'
            searchable
            options={options}
            onChange={onSelectAccount}
          />
        )}
      </FormFieldGroup>
    </div>
  )
}
