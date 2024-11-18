import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Card, CardContent, FocusHeader } from '@latitude-data/web-ui'
import { FocusLayout } from '$/components/layouts'
import { useMetatags } from '$/hooks/useMetatags'
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

export const metadata = useMetatags({
  title: 'You have been invited to join a workspace',
})

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  let workspace, user, membership
  try {
    membership = await findMembershipByTokenCache(token as string)
    if (!membership) return redirect(ROUTES.root)

    workspace = await findWorkspaceCache(membership.workspaceId)
    if (!workspace) return redirect(ROUTES.root)

    user = await findUserCache(membership.userId)
    if (!user) return redirect(ROUTES.root)
  } catch (err) {
    if (err instanceof NotFoundError) {
      return redirect(ROUTES.root)
    } else {
      throw err
    }
  }

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
          <InvitationForm
            user={user}
            membership={membership}
            footer={<AuthFooter />}
          />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
