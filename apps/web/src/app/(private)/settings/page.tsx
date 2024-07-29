'use client'

import { Settings } from '@latitude-data/web-ui'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import useProviderApiKeys from '$/stores/providerApiKeys'
import useUsers from '$/stores/users'

export default function SettingsPage() {
  const { data, update } = useCurrentWorkspace()
  const { data: apiKeys, create, destroy } = useProviderApiKeys()
  const { data: users } = useUsers()

  return (
    <Settings
      users={users}
      workspace={data}
      updateWorkspace={update}
      apiKeys={apiKeys}
      createApiKey={create}
      destroyApiKey={destroy}
    />
  )
}
