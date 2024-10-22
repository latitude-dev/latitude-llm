import { ReactNode } from 'react'

import {
  Container,
  TableBlankSlate,
  TableWithHeader,
} from '@latitude-data/web-ui'
import { AppTabs } from '$/app/(private)/AppTabs'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getActiveProjectsCached } from '../_data-access'
import { ProjectsTable } from './_components/ProjectsTable'

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

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
