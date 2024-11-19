import { ReactNode } from 'react'

import { DatasetsRepository } from '@latitude-data/core/repositories'
import { Container, TableWithHeader } from '@latitude-data/web-ui'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'
import { DatasetsTable } from '$/app/(private)/datasets/_components/DatasetsTable'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export const metadata = buildMetatags({
  title: 'Datasets',
})

export default async function DatasetsList({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const { workspace } = await getCurrentUser()
  const scope = new DatasetsRepository(workspace.id)
  const datasets = await scope.findAll().then((r) => r.unwrap())
  return (
    <Container>
      <AppTabs />
      {children}
      <TableWithHeader
        title='Datasets'
        actions={
          <div className='flex flex-row items-center gap-2'>
            <Link href={ROUTES.datasets.generate.root}>
              <TableWithHeader.Button>Generate dataset</TableWithHeader.Button>
            </Link>
            <Link href={ROUTES.datasets.new.root}>
              <TableWithHeader.Button>Upload dataset</TableWithHeader.Button>
            </Link>
          </div>
        }
        table={<DatasetsTable datasets={datasets} />}
      />
    </Container>
  )
}
