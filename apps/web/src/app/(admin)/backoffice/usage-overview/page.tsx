import { Suspense } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { ROUTES } from '$/services/routes'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { getUsageOverview } from '@latitude-data/core/services/workspaces/index'
import {
  Table,
  Text,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableWithHeader,
  ServerSideTableCell,
  TableBlankSlate,
} from '@latitude-data/web-ui'
import { SubscriptionBadge } from '$/components/UsageIndicatorPopover'
import { buildUsageInformation } from '$/app/(admin)/backoffice/usage-overview/buildUsageInformation'
import { TrendCell } from './_components/TrendCell'
import { UsageCell } from './_components/UsageCell'
import { EmailsCell } from '$/app/(admin)/backoffice/usage-overview/_components/EmailsCell/index.tsx'

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
  const workspacesUsage = await getUsageOverview({ page, pageSize })
  return (
    <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
      <TableWithHeader
        title='Usage overview by workspace'
        description='List of workspaces by usage ordered by the most usage in the current month. The workspaces with more runs in their current period are listed first.'
        table={
          <>
            {workspacesUsage.length <= 0 ? (
              <TableBlankSlate description='There are no more Workspaces with runs to show' />
            ) : (
              <Table
                externalFooter={
                  <LinkableTablePaginationFooter pagination={pagination} />
                }
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Trend</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>subscription</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Emails</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspacesUsage.map((usage) => {
                    const usageInfo = buildUsageInformation(usage)
                    return (
                      <TableRow
                        key={usage.workspaceId}
                        className='border-b-[0.5px] h-12 max-h-12 border-border'
                      >
                        <ServerSideTableCell className='w-8' align='center'>
                          <TrendCell trend={usageInfo.trend} />
                        </ServerSideTableCell>
                        <ServerSideTableCell className='w-40'>
                          <Text.H6 color='foregroundMuted'>
                            {usage.latestRunAt
                              ? formatDistanceToNow(usage.latestRunAt, {
                                  addSuffix: true,
                                })
                              : '-'}
                          </Text.H6>
                        </ServerSideTableCell>
                        <ServerSideTableCell>
                          <div className='flex flex-col gap-y-2 py-2'>
                            <Text.H5M noWrap>{usage.name}</Text.H5M>
                            <div className='flex gap-x-2 items-center'>
                              <Text.H7 color='foregroundMuted'>
                                ID: {usage.workspaceId}
                              </Text.H7>
                            </div>
                          </div>
                        </ServerSideTableCell>
                        <ServerSideTableCell>
                          <div className='flex flex-col gap-y-2 py-2'>
                            <div>
                              <SubscriptionBadge
                                subscription={usageInfo.plan}
                              />
                            </div>
                            <div className='flex gap-x-2 items-center'>
                              <Text.H7 color='foregroundMuted'>
                                Created:{' '}
                                {format(
                                  usage.subscriptionCreatedAt!,
                                  'yyyy-MM-dd HH:mm:ss',
                                )}
                              </Text.H7>
                            </div>
                          </div>
                        </ServerSideTableCell>
                        <ServerSideTableCell>
                          <Suspense fallback={<Text.H6>Loading...</Text.H6>}>
                            <UsageCell
                              usageOverview={usage}
                              subscription={usageInfo.plan}
                            />
                          </Suspense>
                        </ServerSideTableCell>
                        <ServerSideTableCell className='max-w-52'>
                          <EmailsCell {...usageInfo.emails} />
                        </ServerSideTableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </>
        }
      />
    </div>
  )
}
