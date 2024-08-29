import Memberships from './_components/Memberships'
import ProviderApiKeys from './_components/ProviderApiKeys'
import WorkspaceName from './_components/WorkspaceName'

export default function SettingsPage() {
  return (
    <div className='w-full py-6 flex flex-col items-center'>
      <div className='flex flex-col w-[1024px] gap-[40px]'>
        <WorkspaceName />
        <ProviderApiKeys />
        <Memberships />
      </div>
    </div>
  )
}
