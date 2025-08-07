import AuthFooter from '$/app/(public)/_components/Footer'
import LoginFooter from '$/app/(public)/login/_components/LoginFooter'
import buildMetatags from '$/app/_lib/buildMetatags'
import { FocusLayout } from '$/components/layouts'
import { getDataFromSession } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { Card, CardContent } from '@latitude-data/web-ui/atoms/Card'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export const metadata = buildMetatags({
  title: 'The Open-Source LLM Development Platform',
})

export default async function LoginPage() {
  const { user, workspace } = await getDataFromSession()
  if (user && workspace) return redirect(ROUTES.dashboard.root)

  return (
    <FocusLayout
      header={<FocusHeader title='Welcome to Latitude' />}
      footer={<LoginFooter />}
    >
      <Card background='light'>
        <CardContent standalone>
          <LoginForm footer={<AuthFooter />} />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
