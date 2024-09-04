import { ReactNode } from 'react'

import {
  Container,
  ListingHeader,
  TableBlankSlate,
  Text,
} from '@latitude-data/web-ui'
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
import { MAIN_NAV_LINKS, NAV_LINKS } from '../_lib/constants'
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
      sectionLinks={MAIN_NAV_LINKS}
    >
      <Container>
        {children}
        <div className='flex-1'>
          <ListingHeader
            title='Projects'
            actions={
              <Link href={ROUTES.dashboard.projects.new.root}>
                <ListingHeader.Button>Add project</ListingHeader.Button>
              </Link>
            }
          />
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
      </Container>
    </AppLayout>
  )
}
