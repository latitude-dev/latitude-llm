'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useIntegrations from '$/stores/integrations'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { integrationOptions } from '$/lib/integrationTypeOptions'
import { IntegrationType } from '@latitude-data/constants'
import { McpServerStatus } from '../../integrations/[integrationId]/details/_components/McpServerStatus'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'

export default function Integrations() {
  const { data: integrations, isLoading: isLoading } = useIntegrations()

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-row items-center gap-2'>
          <Text.H4B>Integrations</Text.H4B>
          <OpenInDocsButton route={DocsRoute.MCP} />
        </div>
        <Link href={ROUTES.settings.integrations.new.root}>
          <Button fancy variant='outline'>
            Create Integration
          </Button>
        </Link>
      </div>
      <div className='flex flex-col gap-2'>
        {isLoading && <TableSkeleton cols={6} rows={3} />}
        {!isLoading && integrations.length > 0 && <IntegrationsTable />}
        {!isLoading && integrations.length === 0 && (
          <TableBlankSlate
            description='There are no integrations yet. Create one to start working with your prompts.'
            link={
              <Link href={ROUTES.settings.integrations.new.root}>
                <TableBlankSlate.Button>
                  Create integration
                </TableBlankSlate.Button>
              </Link>
            }
          />
        )}
      </div>
    </div>
  )
}

const IntegrationsTable = () => {
  const router = useRouter()
  const { data: integrations, scaleDown, scaleUp } = useIntegrations()
  const { data: workspace } = useCurrentWorkspace()

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Last Used</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {integrations.map((integration) => {
          const values = integrationOptions(integration)
          return (
            <TableRow key={integration.id} hoverable={false} verticalPadding>
              <TableCell>
                <Text.H5>{integration.name}</Text.H5>
              </TableCell>
              <TableCell>
                <div className='flex gap-2 items-center'>
                  <Icon name={values.icon} color='foregroundMuted' />
                  <Text.H5 color='foregroundMuted'>{values.label}</Text.H5>
                </div>
              </TableCell>
              <TableCell>
                <Text.H5 color='foregroundMuted'>
                  {relativeTime(
                    integration.lastUsedAt ? integration.lastUsedAt : null,
                  )}
                </Text.H5>
              </TableCell>
              <TableCell>
                {integration.type === IntegrationType.HostedMCP ? (
                  <McpServerStatus
                    short
                    mcpServerId={integration.mcpServerId || undefined}
                  />
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu
                  options={[
                    {
                      label: 'Details',
                      hidden: integration.type !== IntegrationType.HostedMCP,
                      disabled: integration.type !== IntegrationType.HostedMCP,
                      onClick: () =>
                        router.push(
                          ROUTES.settings.integrations.details(integration.id)
                            .root,
                        ),
                    },
                    {
                      label: 'Scale Up',
                      hidden:
                        integration.type !== IntegrationType.HostedMCP ||
                        workspace?.id !== 1,
                      disabled:
                        integration.type !== IntegrationType.HostedMCP ||
                        workspace?.id !== 1,
                      onClick: () =>
                        integration.mcpServerId &&
                        scaleUp({ mcpServerId: integration.mcpServerId }),
                    },
                    {
                      label: 'Scale Down',
                      hidden:
                        integration.type !== IntegrationType.HostedMCP ||
                        workspace?.id !== 1,
                      disabled:
                        integration.type !== IntegrationType.HostedMCP ||
                        workspace?.id !== 1,
                      onClick: () =>
                        integration.mcpServerId &&
                        scaleDown({ mcpServerId: integration.mcpServerId }),
                      type: 'destructive',
                    },
                    {
                      label: 'Remove',
                      onClick: () =>
                        router.push(
                          ROUTES.settings.integrations.destroy(integration.id)
                            .root,
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
          )
        })}
      </TableBody>
    </Table>
  )
}
