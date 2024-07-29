'use client'

import ProviderApiKeys from './ProviderApiKeys'
import WorkspaceName from './WorkspaceName'

export default function SettingsPage() {
  return (
    <div className='w-full py-6 flex flex-col items-center'>
      <div className='flex flex-col w-[1024px] gap-[40px]'>
        <WorkspaceName />
        <ProviderApiKeys />
      </div>
    </div>
  )
}
