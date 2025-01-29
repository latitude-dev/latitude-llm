'use client'

import { format, subMonths } from 'date-fns'
import { TableCell, Text, TableRow } from '@latitude-data/web-ui'
import { type GetUsageOverviewRow } from '@latitude-data/core/services/workspaces/index'

/**
 * This is a client component because <TableCell /> has an onClick handler that
 * can't be serialized from the server to the client.
 */
export function OverviewRow({
  workspace,
  today,
}: {
  workspace: GetUsageOverviewRow
  today: Date
}) {
  return (
    <TableRow
      key={workspace.id}
      className='border-b-[0.5px] h-12 max-h-12 border-border'
    >
      <TableCell>
        <Text.H5 noWrap>{workspace.name}</Text.H5>
      </TableCell>
      <TableCell>
        <div className='flex flex-col py-1'>
          <div>
            <Text.H2 noWrap>{workspace.lastMonthRuns} runs</Text.H2>
          </div>
          <Text.H6 color='foregroundMuted'>
            {format(subMonths(today, 1), 'yyyy-MM-dd')}
            {' -> '}
            {format(today, 'yyyy-MM-dd')}
          </Text.H6>
        </div>
      </TableCell>
      <TableCell>
        <Text.H5 noWrap>{workspace.twoMonthsAgoPeriodRuns} runs</Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5 noWrap>{workspace.oneMonthAgoPeriodRuns} runs</Text.H5>
      </TableCell>
      <TableCell>
        <div className='flex flex-col py-1'>
          <div>
            <Text.H2 noWrap>{workspace.currentPeriodRuns} runs</Text.H2>
          </div>
          <Text.H6 color='foregroundMuted'>
            {format(workspace.currentPeriodAt as unknown as Date, 'yyyy-MM-dd')}
            {' -> '}
            {format(today, 'yyyy-MM-dd')}
          </Text.H6>
        </div>
      </TableCell>
    </TableRow>
  )
}
