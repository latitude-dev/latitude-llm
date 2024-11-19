import { Card, CardContent, FocusHeader } from '@latitude-data/web-ui'
import buildMetatags from '$/app/_lib/buildMetatags'
import AuthFooter from '$/app/(public)/_components/Footer'
import LoginFooter from '$/app/(public)/login/_components/LoginFooter'
import { FocusLayout } from '$/components/layouts'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export const metadata = buildMetatags({
  title: 'Login to your account',
})

export default async function LoginPage() {
  const data = await getSession()
  if (data.session) return redirect(ROUTES.dashboard.root)

  return (
    <FocusLayout
      header={<FocusHeader title='Welcome to Latitude' />}
      footer={<LoginFooter />}
    >
      <Card>
        <CardContent standalone>
          <LoginForm footer={<AuthFooter />} />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
