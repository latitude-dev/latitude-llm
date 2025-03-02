'use client'

import {
  Button,
  DropdownMenu,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
} from '@latitude-data/web-ui'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useMcpServers from '$/stores/mcpServers'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import StatusCell from './StatusCell'
import { McpServer } from '@latitude-data/core/browser'

export default function McpApplications() {
  const { data: mcpApplications, isLoading } = useMcpServers()

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H4B>MCP Servers</Text.H4B>
        <Link href={ROUTES.settings.mcpApplications.new.root}>
          <Button fancy variant='outline'>
            Create MCP Server
          </Button>
        </Link>
      </div>
      <div className='flex flex-col gap-2'>
        {isLoading && <TableSkeleton cols={4} rows={3} />}
        {!isLoading && mcpApplications.length > 0 && (
          <McpApplicationsTable mcpApplications={mcpApplications} />
        )}
        {!isLoading && mcpApplications.length === 0 && (
          <TableBlankSlate
            description='There are no MCP servers yet. Create one to start working with your prompts.'
            link={
              <Link href={ROUTES.settings.mcpApplications.new.root}>
                <TableBlankSlate.Button>Create one</TableBlankSlate.Button>
              </Link>
            }
          />
        )}
      </div>
    </div>
  )
}

const McpApplicationsTable = ({
  mcpApplications,
}: {
  mcpApplications: McpServer[]
}) => {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Deployed at</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {mcpApplications.map((server) => (
          <TableRow key={server.id} hoverable={false} verticalPadding>
            <TableCell>
              <Text.H5 noWrap>{server.name}</Text.H5>
            </TableCell>
            <TableCell>
              <StatusCell server={server} />
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {relativeTime(server.deployedAt ? server.deployedAt : null)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <DropdownMenu
                options={[
                  {
                    label: 'Remove',
                    onClick: () =>
                      router.push(
                        ROUTES.settings.mcpApplications.destroy(server.id).root,
                      ),
                    type: 'destructive',
                  },
                ]}
                side='bottom'
                align='end'
                triggerButtonProps={{
                  className: 'border-none justify-end cursor-pointer',
                }}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
