'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { cn } from '@latitude-data/web-ui/utils'
import { IssueLog } from '$/stores/issues/logs'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ReactNode } from 'react'

type Props = {
  logs: IssueLog[]
  projectId: number
  commitUuid: string
  documentUuid: string
  showPagination?: boolean
  PaginationFooter?: ReactNode
}

export function IssueLogsTable({
  logs,
  projectId,
  commitUuid,
  documentUuid,
  showPagination,
  PaginationFooter,
}: Props) {
  const handleRowClick = (log: IssueLog) => {
    const route = ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).logs.root

    // Open logs page in new tab with the logUuid as a search parameter
    window.open(`${route}?logUuid=${log.uuid}`, '_blank')
  }
  return (
    <Table
      className='table-auto'
      externalFooter={
        showPagination && PaginationFooter ? PaginationFooter : undefined
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Commit</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow
            key={log.uuid}
            onClick={() => handleRowClick(log)}
            className={cn(
              'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
            )}
          >
            <TableCell>
              <Text.H5 noWrap color='foreground'>
                {relativeTime(
                  log.createdAt instanceof Date
                    ? log.createdAt
                    : new Date(log.createdAt),
                )}
              </Text.H5>
            </TableCell>
            <TableCell>
              <span className='flex flex-row gap-2 items-center truncate'>
                <Badge
                  variant={log.commit.version ? 'accent' : 'muted'}
                  className='flex-shrink-0'
                >
                  <Text.H6 noWrap>
                    {log.commit.version ? `v${log.commit.version}` : 'Draft'}
                  </Text.H6>
                </Badge>
                <Text.H5 color='foreground' noWrap ellipsis>
                  {log.commit.title}
                </Text.H5>
              </span>
            </TableCell>
            <TableCell>
              <Text.H5 noWrap color='foreground'>
                {formatDuration(log.duration)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Icon name='arrowRight' color='foregroundMuted' />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
