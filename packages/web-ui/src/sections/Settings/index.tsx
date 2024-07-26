import { ProviderApiKey, User, Workspace } from '@latitude-data/core'
import { Providers } from '@latitude-data/core/browser'
import { SessionWorkspace } from '$ui/providers'

import ProviderApiKeys from './ProviderApiKeys'
import WorkspaceName from './WorkspaceName'

// TODO: Prop drilling of actions can become unwieldy. Can be avoided with
// context or zustand stores.
export default function Settings({
  workspace,
  updateWorkspace,
  users,
  apiKeys,
  createApiKey,
  destroyApiKey,
}: {
  workspace: SessionWorkspace
  updateWorkspace: (payload: { name: string }) => Promise<Workspace | undefined>
  users: User[]
  apiKeys: ProviderApiKey[]
  createApiKey: (payload: {
    name: string
    provider: Providers
    token: string
  }) => Promise<ProviderApiKey | undefined>
  destroyApiKey: (id: number) => Promise<ProviderApiKey | undefined>
}) {
  return (
    <div className='w-full py-6 flex flex-col items-center'>
      <div className='flex flex-col w-[1024px] gap-[40px]'>
        <WorkspaceName workspace={workspace} update={updateWorkspace} />
        <ProviderApiKeys
          users={users}
          apiKeys={apiKeys}
          createApiKey={createApiKey}
          destroyApiKey={destroyApiKey}
        />
      </div>
    </div>
  )
}
