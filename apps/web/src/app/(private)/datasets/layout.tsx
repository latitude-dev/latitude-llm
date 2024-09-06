import { ReactNode } from 'react'

import {
  Container,
  TableBlankSlate,
  TableWithHeader,
} from '@latitude-data/web-ui'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { MAIN_NAV_LINKS, NAV_LINKS } from '../_lib/constants'

export default async function DatasetsList({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

  const { user } = await getCurrentUser()

  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={{ ...user }}
      sectionLinks={MAIN_NAV_LINKS}
    >
      <Container>
        {children}
        <TableWithHeader
          title='Datasets'
          actions={
            <Link href={ROUTES.datasets.new.root}>
              <TableWithHeader.Button>Upload dataset</TableWithHeader.Button>
            </Link>
          }
          table={
            <TableBlankSlate
              description='There are no datasets yet. Create one to start testing your prompts.'
              link={
                <Link href={ROUTES.datasets.new.root}>
                  <TableBlankSlate.Button>
                    Create your first dataset
                  </TableBlankSlate.Button>
                </Link>
              }
            />
          }
        />
      </Container>
    </AppLayout>
  )
}
