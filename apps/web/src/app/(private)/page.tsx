import { FocusHeader, FocusLayout } from '@latitude-data/web-ui'
import DummyLogoutButton from '$/app/(private)/_components/DummyLogoutButton'

export const dynamic = 'force-dynamic'

export default async function Home() {
  return (
    <FocusLayout
      header={
        <FocusHeader
          title='Inside the APP 💪'
          description="Your're in let's kick those random AI's butts!"
        />
      }
    >
      <div className='flex items-center justify-center'>
        <DummyLogoutButton />
      </div>
    </FocusLayout>
  )
}
