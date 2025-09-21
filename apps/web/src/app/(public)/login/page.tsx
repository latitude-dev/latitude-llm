import AuthFooter from '$/app/(public)/_components/Footer'
import LoginFooter from '$/app/(public)/login/_components/LoginFooter'
import buildMetatags from '$/app/_lib/buildMetatags'
import FocusLayout from '$/components/layouts/FocusLayout'
import { getDataFromSession } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { isLatitudeUrl } from '@latitude-data/constants'
import { Card, CardContent } from '@latitude-data/web-ui/atoms/Card'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Sign in to your account',
  })
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string
  }>
}) {
  const { returnTo } = await searchParams

  const { user, workspace } = await getDataFromSession()
  if (user && workspace) {
    if (!returnTo || !isLatitudeUrl(returnTo)) {
      return redirect(ROUTES.dashboard.root)
    }

    return redirect(returnTo)
  }

  return (
    <FocusLayout
      header={<FocusHeader title='Welcome to Latitude' />}
      footer={<LoginFooter returnTo={returnTo} />}
    >
      <Card background='light'>
        <CardContent standalone>
          <LoginForm footer={<AuthFooter />} returnTo={returnTo} />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
