import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { ROUTES } from '$/services/routes'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { getUsageOverview } from '@latitude-data/core/services/workspaces/index'
import { OverviewRow } from '$/app/(admin)/backoffice/usage-overview/_components/OverviewRow'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableWithHeader,
} from '@latitude-data/web-ui'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>
}) {
  const { page: pageParam, pageSize: pageSizeParam } = await searchParams
  const page = pageParam ? +pageParam : 1
  const pageSize = pageSizeParam ? +pageSizeParam : 25
  const pagination = buildPagination({
    count: Infinity, // We avoid calculating the full amount of workspaces
    baseUrl: ROUTES.backoffice.usageOverview.root,
    page,
    pageSize,
  })
  const workspaces = await getUsageOverview({ page, pageSize })
  const today = new Date()
  return (
    <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
      <TableWithHeader
        title='Usage overview by workspace'
        description='List of workspaces by usage ordered by the most usage in the current month. The workspaces with more runs in their current period are listed first.'
        table={
          <Table
            externalFooter={
              <LinkableTablePaginationFooter pagination={pagination} />
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Subscription</TableHead>
                <TableHead>Last 30 days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace) => (
                <OverviewRow
                  key={workspace.workspaceId}
                  workspace={workspace}
                  today={today}
                />
              ))}
            </TableBody>
          </Table>
        }
      />
    </div>
  )
}
