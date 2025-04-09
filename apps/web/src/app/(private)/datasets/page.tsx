import { DatasetsRepository } from '@latitude-data/core/repositories'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { env } from '@latitude-data/env'
import { RootDatasetHeader } from './_components/RootHeader'
import { DatasetsTable } from './_components/DatasetsTable'
import { Dataset, Workspace } from '@latitude-data/core/browser'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import { IDatasetSettingsModal } from '$/services/routes'
import Layout from './_components/Layout'

type GetDataResult = { datasets: Dataset[] }

// TODO: move back to the body of the component when datasets V2 is ready
async function getData({
  workspace,
  page,
  pageSize,
}: {
  workspace: Workspace
  page: string | undefined
  pageSize: string | undefined
}): Promise<TypedResult<GetDataResult, Error>> {
  const scope = new DatasetsRepository(workspace.id)
  const datasets = await scope.findAllPaginated({
    page,
    pageSize: pageSize as string | undefined,
  })
  return Result.ok({ datasets })
}

export default async function DatasetsRoot({
  searchParams,
}: {
  searchParams: Promise<{
    pageSize: string
    page?: string
    modal?: IDatasetSettingsModal
    backUrl?: string
    name?: string
    parameters?: string
  }>
}) {
  const { workspace } = await getCurrentUser()
  const {
    pageSize,
    page: pageString,
    modal,
    name,
    parameters,
    backUrl,
  } = await searchParams
  const page = pageString?.toString?.()
  const { datasets } = await getData({ workspace, page, pageSize }).then((r) =>
    r.unwrap(),
  )
  return (
    <Layout>
      <TableWithHeader
        title='Datasets'
        actions={
          <RootDatasetHeader
            backUrl={backUrl}
            isCloud={env.LATITUDE_CLOUD}
            openNewDatasetModal={modal === 'new'}
            openGenerateDatasetModal={modal === 'generate'}
            generateInput={{ name, parameters, backUrl }}
          />
        }
        table={<DatasetsTable datasets={datasets} />}
      />
    </Layout>
  )
}
