import {
  Card,
  CardContent,
  FocusHeader,
  FocusLayout,
} from '@latitude-data/web-ui'
import AuthFooter from '$/app/(public)/_components/Footer'
import { isWorkspaceCreated } from '$/data-access'
import db from '$/db/database'
import { ROUTES } from '$/lib/routes'
import { redirect } from 'next/navigation'

import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const isSetup = await isWorkspaceCreated({ db })

  if (!isSetup) {
    return redirect(ROUTES.auth.setup)
  }

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
