import { listTraces } from '@latitude-data/core/services/traces/list'
import { TableWithHeader } from '@latitude-data/web-ui'
import { getApiKeysCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { TracesTable } from './_components/TracesTable'
import { TracesBlankSlate } from './_components/TracesBlankSlate'

export default async function TracesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page: string
    pageSize: string
  }>
}) {
  const { workspace } = await getCurrentUser()
  const { page, pageSize } = await searchParams
  const apiKeys = await getApiKeysCached()
  const traces = await listTraces({
    workspace,
    page: Number(page ?? '1'),
    pageSize: Number(pageSize ?? '25'),
  }).then((r) => r.unwrap())

  if (!traces?.items.length) {
    return <TracesBlankSlate apiKey={apiKeys[0]?.token} />
  }

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader title='Traces' table={<TracesTable traces={traces} />} />
    </div>
  )
}
