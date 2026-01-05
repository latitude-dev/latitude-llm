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
  SortableTableHead,
  type SortDirection,
} from '@latitude-data/web-ui/atoms/Table'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
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
import { useState, useMemo } from 'react'
import Image from 'next/image'
import type { ExternalMcpIntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import type { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { ToolsModal } from './ToolsModal'

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

function getOAuthStatus(integration: {
  type: IntegrationType
  configuration: unknown
}): 'pending' | 'completed' | null {
  if (integration.type !== IntegrationType.ExternalMCP) return null
  const config =
    integration.configuration as ExternalMcpIntegrationConfiguration
  if (!config.useOAuth) return null
  return config.oauthStatus ?? 'pending'
}

const IntegrationsTable = () => {
  const router = useRouter()
  const {
    data: integrations,
    scaleDown,
    scaleUp,
    reauthorize,
  } = useIntegrations()
  const { data: workspace } = useCurrentWorkspace()
  const [sortLastUsedDirection, setSortLastUsedDirection] =
    useState<SortDirection>(null)
  const [sortCreatedAtDirection, setSortCreatedAtDirection] =
    useState<SortDirection>(null)
  const [toolsModalIntegration, setToolsModalIntegration] =
    useState<IntegrationDto | null>(null)

  const handleLastUsedSort = () => {
    if (sortLastUsedDirection === null) {
      setSortLastUsedDirection('desc')
      setSortCreatedAtDirection(null)
    } else if (sortLastUsedDirection === 'desc') {
      setSortLastUsedDirection('asc')
    } else {
      setSortLastUsedDirection(null)
    }
  }

  const handleCreatedAtSort = () => {
    if (sortCreatedAtDirection === null) {
      setSortCreatedAtDirection('desc')
      setSortLastUsedDirection(null)
    } else if (sortCreatedAtDirection === 'desc') {
      setSortCreatedAtDirection('asc')
    } else {
      setSortCreatedAtDirection(null)
    }
  }

  const sortedIntegrations = useMemo(() => {
    if (!sortLastUsedDirection && !sortCreatedAtDirection) return integrations

    return [...integrations].sort((a, b) => {
      if (sortLastUsedDirection) {
        const aTime = a.lastUsedAt ? a.lastUsedAt.getTime() : 0
        const bTime = b.lastUsedAt ? b.lastUsedAt.getTime() : 0
        return sortLastUsedDirection === 'asc' ? aTime - bTime : bTime - aTime
      }

      if (sortCreatedAtDirection) {
        const aTime = a.createdAt.getTime()
        const bTime = b.createdAt.getTime()
        return sortCreatedAtDirection === 'asc' ? aTime - bTime : bTime - aTime
      }

      return 0
    })
  }, [integrations, sortLastUsedDirection, sortCreatedAtDirection])

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <SortableTableHead
            sortDirection={sortLastUsedDirection}
            onSort={handleLastUsedSort}
          >
            Last Used
          </SortableTableHead>
          <SortableTableHead
            sortDirection={sortCreatedAtDirection}
            onSort={handleCreatedAtSort}
          >
            Created At
          </SortableTableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedIntegrations.map((integration) => {
          const values = integrationOptions(integration)
          const oauthStatus = getOAuthStatus(integration)
          return (
            <TableRow key={integration.id} hoverable={false} verticalPadding>
              <TableCell>
                <Text.H5>{integration.name}</Text.H5>
              </TableCell>
              <TableCell>
                <div className='flex gap-2 items-center'>
                  {values.icon.type === 'image' ? (
                    <Image
                      src={values.icon.src}
                      alt={values.icon.alt}
                      width={16}
                      height={16}
                      className='rounded'
                      unoptimized
                    />
                  ) : (
                    <Icon name={values.icon.name} color='foregroundMuted' />
                  )}
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
                <Text.H5 color='foregroundMuted'>
                  {relativeTime(
                    integration.createdAt ? integration.createdAt : null,
                  )}
                </Text.H5>
              </TableCell>
              <TableCell>
                {integration.type === IntegrationType.HostedMCP ? (
                  <McpServerStatus
                    short
                    mcpServerId={integration.mcpServerId || undefined}
                  />
                ) : oauthStatus === 'pending' ? (
                  <Badge variant='warningMuted'>OAuth Pending</Badge>
                ) : oauthStatus === 'completed' ? (
                  <Badge variant='successMuted'>OAuth Connected</Badge>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu
                  options={[
                    {
                      label: 'See available tools',
                      hidden:
                        !integration.hasTools || oauthStatus === 'pending',
                      disabled:
                        !integration.hasTools || oauthStatus === 'pending',
                      onClick: () => setToolsModalIntegration(integration),
                    },
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
                      label:
                        oauthStatus === 'pending'
                          ? 'Complete OAuth Setup'
                          : 'Re-authorize OAuth',
                      hidden: oauthStatus === null,
                      disabled: oauthStatus === null,
                      onClick: () =>
                        reauthorize({ integrationId: integration.id }),
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
      {toolsModalIntegration && (
        <ToolsModal
          integration={toolsModalIntegration}
          onClose={() => setToolsModalIntegration(null)}
        />
      )}
    </Table>
  )
}
