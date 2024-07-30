import Link from 'next/link'
import ProviderApiKeys from './_components/ProviderApiKeys'
import WorkspaceName from './_components/WorkspaceName'

export default function SettingsPage() {
  return (
    <div className='w-full py-6 flex flex-col items-center'>
      <div className='flex flex-col w-[1024px] gap-[40px]'>
        <Link href='/settings/patata'>Go to patata</Link>
        <WorkspaceName />
        <ProviderApiKeys />
      </div>
    </div>
  )
}
