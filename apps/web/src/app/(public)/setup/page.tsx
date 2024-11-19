import { Card, CardContent, FocusHeader } from '@latitude-data/web-ui'
import AuthFooter from '$/app/(public)/_components/Footer'
import { FocusLayout } from '$/components/layouts'

import SetupForm from './SetupForm'

export const dynamic = 'force-dynamic'

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
    >
      <Card>
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
