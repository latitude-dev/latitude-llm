import { ReactNode } from 'react'

import { DatasetsRepository } from '@latitude-data/core/repositories'
import { Container, TableWithHeader, Text } from '@latitude-data/web-ui'
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
            <div className='flex flex-row items-center gap-2'>
              <Link href={ROUTES.datasets.generate.root}>
                <TableWithHeader.Button>
                  Generate dataset
                </TableWithHeader.Button>
              </Link>
              <Link href={ROUTES.datasets.new.root}>
                <TableWithHeader.Button>Upload dataset</TableWithHeader.Button>
              </Link>
            </div>
          }
          table={<DatasetsTable datasets={datasets} />}
        />
      </Container>
    </AppLayout>
  )
}
