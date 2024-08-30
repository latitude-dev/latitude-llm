import { Card, CardContent, FocusHeader } from '@latitude-data/web-ui'
import { FocusLayout } from '$/components/layouts'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import AuthFooter from '../../_components/Footer'
import {
  findMembershipByTokenCache,
  findUserCache,
  findWorkspaceCache,
} from '../../_data_access'
import InvitationForm from './InvitationForm'

export const dynamic = 'force-dynamic'

export default async function InvitationPage({
  params,
}: {
  params: { token: string }
}) {
  const { token } = params
  const m = await findMembershipByTokenCache(token as string)
  if (!m) return redirect(ROUTES.root)

  const workspace = await findWorkspaceCache(m.workspaceId)
  if (!workspace) return redirect(ROUTES.root)

  const user = await findUserCache(m.userId)
  if (!user) return redirect(ROUTES.root)

  return (
    <FocusLayout
      header={
        <FocusHeader
          title={`You've been invited`}
          description={`You have been invited to join the Workspace ${workspace.name}`}
        />
      }
    >
      <Card>
        <CardContent standalone>
          <InvitationForm user={user} membership={m} footer={<AuthFooter />} />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
