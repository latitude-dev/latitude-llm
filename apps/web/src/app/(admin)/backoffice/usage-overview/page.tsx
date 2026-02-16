import { formatDistanceToNow, format } from 'date-fns'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { ROUTES } from '$/services/routes'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  getUsageOverview,
  GetUsageOverviewRow,
} from '@latitude-data/core/services/workspaces/index'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { ServerSideTableCell } from '@latitude-data/web-ui/atoms/Table'
import { SubscriptionBadge } from '$/components/UsageIndicatorPopover'
import { buildUsageInformation } from '$/app/(admin)/backoffice/usage-overview/buildUsageInformation'
import { TrendCell } from './_components/TrendCell'
import { UsageCell } from './_components/UsageCell'
import { UsageDetailsButton } from './_components/UsageDetailsButton'
import Link from 'next/link'

function formatSubscriptionDate(usage: GetUsageOverviewRow) {
  try {
    return format(usage.subscriptionCreatedAt!, 'yyyy-MM-dd HH:mm:ss')
  } catch (e) {
    const error = e as Error
    const message = `Error formatting subscription date (${usage.subscriptionCreatedAt}) for workspace ${usage.workspaceId}. Error: ${error.message}`
    throw new Error(message)
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>
}) {
  const { page: pageParam, pageSize: pageSizeParam } = await searchParams
  const page = pageParam ? +pageParam : 1
  const pageSize = pageSizeParam ? +pageSizeParam : 25
  const pagination = buildPagination({
    count: Infinity,
    baseUrl: ROUTES.backoffice.usageOverview.root,
    page,
    pageSize,
  })
  const workspacesUsage = await getUsageOverview({ page, pageSize })
  return (
    <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
      <TableWithHeader
        title='Usage overview by workspace'
        description='List of workspaces by usage ordered by the most usage in the current month. The workspaces with more traces in their current period are listed first.'
        table={
          <>
            {workspacesUsage.length <= 0 ? (
              <TableBlankSlate description='There are no more Workspaces with traces to show' />
            ) : (
              <Table
                externalFooter={
                  <LinkableTablePaginationFooter pagination={pagination} />
                }
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Trend</TableHead>
                    <TableHead>Last trace</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Details</TableHead>
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
                        <ServerSideTableCell>
                          <TrendCell trend={usageInfo.trend} />
                        </ServerSideTableCell>
                        <ServerSideTableCell className='w-40'>
                          <Text.H6 color='foregroundMuted'>
                            {usage.latestTraceAt
                              ? formatDistanceToNow(usage.latestTraceAt, {
                                  addSuffix: true,
                                })
                              : '-'}
                          </Text.H6>
                        </ServerSideTableCell>
                        <ServerSideTableCell>
                          <Link
                            href={ROUTES.backoffice.search.workspace(
                              usage.workspaceId!,
                            )}
                          >
                            <div className='flex flex-col gap-y-2 py-2'>
                              <div className='flex flex-row items-center gap-1'>
                                <Text.H5M noWrap>{usage.name}</Text.H5M>
                                <Icon name='externalLink' size='small' />
                              </div>
                              <div className='flex gap-x-2 items-center'>
                                <Text.H7 color='foregroundMuted'>
                                  ID: {usage.workspaceId}
                                </Text.H7>
                              </div>
                            </div>
                          </Link>
                        </ServerSideTableCell>
                        <ServerSideTableCell>
                          <div className='flex flex-col gap-y-2 py-2'>
                            <div>
                              <SubscriptionBadge
                                showPlanSlug
                                subscription={usageInfo.plan}
                              />
                            </div>
                            <div className='flex gap-x-2 items-center'>
                              <Text.H7 color='foregroundMuted'>
                                Created: {formatSubscriptionDate(usage)}
                              </Text.H7>
                            </div>
                          </div>
                        </ServerSideTableCell>
                        <ServerSideTableCell>
                          <UsageCell usageOverview={usage} />
                        </ServerSideTableCell>
                        <ServerSideTableCell>
                          <UsageDetailsButton
                            workspaceId={usage.workspaceId!}
                            workspaceName={usage.name ?? 'Unknown'}
                          />
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
