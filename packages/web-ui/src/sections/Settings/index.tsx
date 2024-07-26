import { Workspace } from '@latitude-data/core'
import { SessionWorkspace } from '$ui/providers'

import WorkspaceName from './WorkspaceName'

function ProviderApiKeys() {
  return null
}

// TODO: Prop drilling of actions can become unwieldy. Can be avoided with context or zustand stores.
export default function Settings({
  workspace,
  updateWorkspace,
}: {
  workspace: SessionWorkspace
  updateWorkspace: (payload: { name: string }) => Promise<Workspace>
}) {
  return (
    <div className='w-full py-6 flex flex-col items-center'>
      <div className='flex flex-col w-[1024px] gap-8'>
        <WorkspaceName workspace={workspace} update={updateWorkspace} />
        <ProviderApiKeys />
      </div>
    </div>
  )
}
