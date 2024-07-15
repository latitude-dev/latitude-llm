import { Card, CardContent, FocusHeader } from '@latitude-data/web-ui'
import { FocusLayout } from '@latitude-data/web-ui/browser'
import AuthFooter from '$/app/(public)/_components/Footer'
import { isWorkspaceCreated } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const isSetup = await isWorkspaceCreated()
  if (!isSetup) return redirect(ROUTES.auth.setup)

  return (
    <FocusLayout header={<FocusHeader title='Welcome to Latitude' />}>
      <Card>
        <CardContent standalone>
          <LoginForm footer={<AuthFooter />} />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
