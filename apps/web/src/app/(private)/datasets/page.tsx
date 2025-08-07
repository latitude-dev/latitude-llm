import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { IDatasetSettingsModal } from '$/services/routes'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { env } from '@latitude-data/env'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { DatasetsTable } from './_components/DatasetsTable'
import Layout from './_components/Layout'
import { RootDatasetHeader } from './_components/RootHeader'

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
  const { workspace } = await getCurrentUserOrRedirect()
  const {
    pageSize,
    page: pageString,
    modal,
    name,
    parameters,
    backUrl,
  } = await searchParams
  const page = pageString?.toString?.()
  const scope = new DatasetsRepository(workspace.id)
  const datasets = await scope.findAllPaginated({
    page,
    pageSize: pageSize as string | undefined,
  })
  return (
    <Layout>
      <TableWithHeader
        title={
          <div className='flex flex-row items-center gap-2'>
            <Text.H4B>Datasets</Text.H4B>
            <OpenInDocsButton route={DocsRoute.Datasets} />
          </div>
        }
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
