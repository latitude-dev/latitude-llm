import { ReactNode } from 'react'

import {
  Container,
  TableBlankSlate,
  TableWithHeader,
  Text,
} from '@latitude-data/web-ui'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { MAIN_NAV_LINKS, NAV_LINKS } from '../_lib/constants'

export default async function DatasetsList({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const { workspace, user } = await getCurrentUser()

  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={{ ...user }}
      sectionLinks={MAIN_NAV_LINKS}
      breadcrumbs={[
        {
          name: workspace.name,
        },
        {
          name: <Text.H5M>Datasets</Text.H5M>,
        },
      ]}
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
        />
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
      </Container>
    </AppLayout>
  )
}
