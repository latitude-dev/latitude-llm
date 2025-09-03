import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { findWorkspaceByIdForAdmin } from '$/data-access'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { WorkspaceDashboard } from './_components/WorkspaceDashboard'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type Props = {
  params: Promise<{ id: string }>
}

export default async function WorkspaceInfoPage({ params }: Props) {
  const { user } = await getCurrentUserOrRedirect()
  if (!user?.admin) {
    return notFound()
  }

  const { id } = await params
  const workspaceId = parseInt(id)

  if (isNaN(workspaceId)) {
    return notFound()
  }

  const result = await findWorkspaceByIdForAdmin({
    workspaceId,
    userId: user.id,
  })

  if (result.error) {
    return (
      <div className='container mx-auto p-6 max-w-4xl'>
        <div className='space-y-6'>
          <div className='flex items-center justify-between'>
            <div className='flex flex-col gap-2'>
              <Text.H1>Workspace Not Found</Text.H1>
              <Text.H5 color='foregroundMuted'>
                No workspace found with ID: {workspaceId}
              </Text.H5>
            </div>
            <Link href={ROUTES.backoffice[BackofficeRoutes.search].root}>
              <Button fancy variant='outline'>
                <Text.H5 noWrap>← Back to Search</Text.H5>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <WorkspaceDashboard workspace={result.value} />
}
