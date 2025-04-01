import { ReactNode } from 'react'

import { Container } from '@latitude-data/web-ui/atoms/Container'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { getActiveProjectsCached } from '../_data-access'
import { ProjectsTable } from './_components/ProjectsTable'

export const metadata = buildMetatags({
  title: 'Dashboard',
})

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const { workspace } = await getCurrentUser()

  const projects = await getActiveProjectsCached({ workspaceId: workspace.id })

  return (
    <Container>
      <AppTabs />
      {children}
      <TableWithHeader
        title='Projects'
        actions={
          <Link href={ROUTES.dashboard.projects.new.root}>
            <TableWithHeader.Button>Add project</TableWithHeader.Button>
          </Link>
        }
        table={
          <>
            {projects.length > 0 && <ProjectsTable projects={projects} />}
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
          </>
        }
      />
    </Container>
  )
}
