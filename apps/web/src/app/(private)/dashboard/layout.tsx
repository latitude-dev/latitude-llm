import { ReactNode } from 'react'

import { Button, TableBlankSlate, Text } from '@latitude-data/web-ui'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  getActiveProjectsCached,
  getDocumentsFromMergedCommitsCache,
} from '../_data-access'
import { NAV_LINKS } from '../_lib/constants'
import { ProjectsTable } from './_components/ProjectsTable'

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

  const { workspace, user } = await getCurrentUser()
  const projects = await getActiveProjectsCached({ workspaceId: workspace.id })
  const documents = await getDocumentsFromMergedCommitsCache(workspace.id)
  const sectionLinks = [
    { label: 'Projects', href: ROUTES.dashboard.root },
    { label: 'Evaluations', href: ROUTES.evaluations.root },
    { label: 'Settings', href: ROUTES.settings.root },
  ]

  const breadcrumbs = [
    {
      name: <Text.H5M>{workspace.name}</Text.H5M>,
    },
  ]

  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={{ ...user }}
      breadcrumbs={breadcrumbs}
      sectionLinks={sectionLinks}
    >
      <div className='flex justify-center items-center max-w-screen-xl m-auto py-6'>
        {children}
        <div className='flex-1'>
          <div className='flex flex-row justify-between items-center gap-4 pb-4'>
            <Text.H4B>Projects</Text.H4B>
            <Link href={ROUTES.dashboard.projects.new.root}>
              <Button fancy variant='outline'>
                Add project
              </Button>
            </Link>
          </div>
          <div className='flex flex-col gap-2'>
            {projects.length > 0 && (
              <ProjectsTable documents={documents} projects={projects} />
            )}
            {projects.length === 0 && (
              <TableBlankSlate
                description='There are no projects yet. Create one to start adding your prompts.'
                link={
                  <Link href={ROUTES.dashboard.projects.new.root}>
                    <TableBlankSlate.Button>
                      Create your first project
                    </TableBlankSlate.Button>
                  </Link>
                }
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
