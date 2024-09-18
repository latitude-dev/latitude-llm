import { ReactNode } from 'react'

import { DatasetsRepository } from '@latitude-data/core/repositories'
import {
  Container,
  TableBlankSlate,
  TableWithHeader,
  Text,
} from '@latitude-data/web-ui'
import { AppTabs } from '$/app/(private)/AppTabs'
import { DatasetsTable } from '$/app/(private)/datasets/_components/DatasetsTable'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { NAV_LINKS } from '../_lib/constants'

export default async function DatasetsList({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const { workspace, user } = await getCurrentUser()
  const scope = new DatasetsRepository(workspace.id)
  const datasets = await scope.findAll().then((r) => r.unwrap())
  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={user}
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
        <AppTabs />
        {children}
        <TableWithHeader
          title='Datasets'
          actions={
            <Link href={ROUTES.datasets.new.root}>
              <TableWithHeader.Button>Upload dataset</TableWithHeader.Button>
            </Link>
          }
          table={
            <>
              {datasets.length > 0 ? (
                <DatasetsTable datasets={datasets} />
              ) : (
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
              )}
            </>
          }
        />
      </Container>
    </AppLayout>
  )
}
