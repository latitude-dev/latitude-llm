import { ReactNode } from 'react'
import { Metadata } from 'next'

import { Container } from '@latitude-data/web-ui/atoms/Container'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { getActiveProjectsCached } from '../_data-access'
import { ProjectsTable } from './_components/ProjectsTable'

export const metadata: Promise<Metadata> = buildMetatags({
  title: 'Dashboard',
  locationDescription: 'Projects List',
})

export default async function DashboardLayout({
  children,
  modal,
}: Readonly<{
  children: ReactNode
  modal: ReactNode
}>) {
  const { workspace } = await getCurrentUserOrRedirect()

  const projects = await getActiveProjectsCached({ workspaceId: workspace.id })

  return (
    <Container>
      <AppTabs />
      {children}
      {modal}
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
