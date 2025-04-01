import {
  DatasetsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { env } from '@latitude-data/env'
import { RootDatasetHeader } from './_components/RootHeader'
import { DatasetsTable as DatasetsV1Table } from './_v1DeprecatedComponents/DatasetsTable'
import { DatasetsTable } from './_components/DatasetsTable'
import { Dataset, DatasetV2, Workspace } from '@latitude-data/core/browser'
import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import { IDatasetSettingsModal } from '$/services/routes'
import Layout from './_components/Layout'

type GetDataResult =
  | { isV2: false; datasets: Dataset[] }
  | { isV2: true; datasets: DatasetV2[] }

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
  const flags = getFeatureFlagsForWorkspaceCached({ workspace })
  const isV1 = !flags.datasetsV2.enabled

  if (isV1) {
    const scope = new DatasetsRepository(workspace.id)
    const datasetsResult = await scope.findAll()
    if (datasetsResult.error) return Result.error(datasetsResult.error)

    const datasets = datasetsResult.value
    return Result.ok({ datasets, isV2: false })
  }

  const scope = new DatasetsV2Repository(workspace.id)
  const datasets = await scope.findAllPaginated({
    page,
    pageSize: pageSize as string | undefined,
  })
  return Result.ok({ datasets, isV2: true })
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
  const flags = getFeatureFlagsForWorkspaceCached({ workspace })
  const canNotModifyDatasets = flags.datasetsV1ModificationBlocked.enabled
  const {
    pageSize,
    page: pageString,
    modal,
    name,
    parameters,
    backUrl,
  } = await searchParams
  const page = pageString?.toString?.()
  const { datasets, isV2 } = await getData({ workspace, page, pageSize }).then(
    (r) => r.unwrap(),
  )
  return (
    <Layout>
      <TableWithHeader
        title='Datasets'
        description={
          <>
            {canNotModifyDatasets && !isV2 ? (
              <Alert
                variant='default'
                title='Dataset creation disabled'
                description="We're running some maintenance on datasets. At the moment is not possible to create or delete datasets. Please try again later."
              />
            ) : null}
          </>
        }
        actions={
          <RootDatasetHeader
            isV2={isV2}
            backUrl={backUrl}
            isCloud={env.LATITUDE_CLOUD}
            openNewDatasetModal={modal === 'new'}
            openGenerateDatasetModal={modal === 'generate'}
            generateInput={{ name, parameters, backUrl }}
          />
        }
        table={
          <>
            {isV2 ? (
              <DatasetsTable datasets={datasets} />
            ) : (
              <DatasetsV1Table datasets={datasets} />
            )}
          </>
        }
      />
    </Layout>
  )
}
