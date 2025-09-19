import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { findProjectByIdForAdmin } from '$/data-access'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Result } from '@latitude-data/core/lib/Result'

import { ProjectDashboard } from './_components/ProjectDashboard'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ProjectInfoPage({ params }: Props) {
  const { user } = await getCurrentUserOrRedirect()
  if (!user?.admin) {
    return notFound()
  }

  const { id } = await params
  const projectId = parseInt(id)

  if (isNaN(projectId)) {
    return notFound()
  }

  const result = await findProjectByIdForAdmin({
    projectId,
    userId: user.id,
  })

  if (!Result.isOk(result)) {
    return (
      <div className='container mx-auto p-6 max-w-4xl'>
        <div className='space-y-6'>
          <div className='flex items-center justify-between'>
            <div className='flex flex-col gap-2'>
              <Text.H1>Project Not Found</Text.H1>
              <Text.H5 color='foregroundMuted'>
                No project found with ID: {projectId}
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

  return <ProjectDashboard project={result.value} />
}
