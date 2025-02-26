import { DatasetsV2Repository } from '@latitude-data/core/repositories'
import { TableWithHeader } from '@latitude-data/web-ui'
import { DatasetsTable } from '$/app/(private)/datasets-v2/_components/DatasetsTable'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import env from '$/env'
import { RootDatasetHeader } from '$/app/(private)/datasets-v2/_components/RootHeader'

export default async function DatasetsRoot({
  searchParams,
}: {
  searchParams: Promise<{
    pageSize: string
    page?: string
    parameters?: string
    name?: string
    backUrl?: string
  }>
}) {
  const {
    pageSize,
    page: pageString,
    parameters,
    name,
    backUrl,
  } = await searchParams
  const page = pageString?.toString?.()
  const { workspace } = await getCurrentUser()
  const scope = new DatasetsV2Repository(workspace.id)
  const datasets = await scope.findAllPaginated({
    page,
    pageSize: pageSize as string | undefined,
  })

  console.log('DATASET ROOT', datasets)
  return (
    <TableWithHeader
      title='Datasets'
      actions={
        <RootDatasetHeader
          isCloud={env.LATITUDE_CLOUD}
          parameters={parameters}
          defaultName={name}
          backUrl={backUrl}
        />
      }
    />
  )
}
