import { Card, CardContent, FocusHeader } from '@latitude-data/web-ui'
import buildMetatags from '$/app/_lib/buildMetatags'
import AuthFooter from '$/app/(public)/_components/Footer'
import { FocusLayout } from '$/components/layouts'

import SetupForm from './SetupForm'
import SignupFooter from '$/app/(public)/setup/_components/SignupFooter'

export const dynamic = 'force-dynamic'

export const metadata = buildMetatags({
  title: 'Create an account',
})

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<
    { email: string; name: string; companyName: string } | undefined
  >
}) {
  const result = await searchParams
  const { email, name, companyName } = result ?? {}

  return (
    <FocusLayout
      header={
        <FocusHeader
          title='Create your Latitude account'
          description='Join us today and start improve the way you work with LLMs!'
        />
      }
      footer={<SignupFooter />}
    >
      <Card background='light'>
        <CardContent standalone>
          <SetupForm
            email={email}
            name={name}
            companyName={companyName}
            footer={<AuthFooter />}
          />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
