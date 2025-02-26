import { DatasetsV2Repository } from '@latitude-data/core/repositories'
import { TableWithHeader } from '@latitude-data/web-ui'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import env from '$/env'
import { RootDatasetHeader } from '$/app/(private)/datasets-v2/_components/RootHeader'
import { DatasetsTable } from './_components/DatasetsTable'

export default async function DatasetsRoot({
  searchParams,
}: {
  searchParams: Promise<{
    pageSize: string
    page?: string
  }>
}) {
  const { pageSize, page: pageString } = await searchParams
  const page = pageString?.toString?.()
  const { workspace } = await getCurrentUser()
  const scope = new DatasetsV2Repository(workspace.id)
  const datasets = await scope.findAllPaginated({
    page,
    pageSize: pageSize as string | undefined,
  })
  return (
    <TableWithHeader
      title='Datasets'
      actions={<RootDatasetHeader isCloud={env.LATITUDE_CLOUD} />}
      table={<DatasetsTable datasets={datasets} />}
    />
  )
}
