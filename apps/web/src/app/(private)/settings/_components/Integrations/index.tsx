'use client'

import { type IntegrationDto } from '@latitude-data/core/browser'
import {
  Button,
  DropdownMenu,
  Icon,
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
import useIntegrations from '$/stores/integrations'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { integrationOptions } from '$/lib/integrationTypeOptions'
import { IntegrationType } from '@latitude-data/constants'
import { useMcpServer } from '$/stores/mcpServer'
import { useEffect } from 'react'
import { McpServerStatus } from '../../integrations/[integrationId]/details/_components/McpServerStatus'

export default function Integrations() {
  const { data: integrations, isLoading: isLoading } = useIntegrations()

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H4B>Integrations</Text.H4B>
        <Link href={ROUTES.settings.integrations.new.root}>
          <Button fancy variant='outline'>
            Create Integration
          </Button>
        </Link>
      </div>
      <div className='flex flex-col gap-2'>
        {isLoading && <TableSkeleton cols={6} rows={3} />}
        {!isLoading && integrations.length > 0 && (
          <IntegrationsTable integrations={integrations} />
        )}
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

const IntegrationsTable = ({
  integrations,
}: {
  integrations: IntegrationDto[]
}) => {
  const router = useRouter()

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
                  <IntegrationMcpServerStatus integration={integration} />
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

function IntegrationMcpServerStatus({
  integration,
}: {
  integration: IntegrationDto
}) {
  const { data: mcpServer, updateMcpServerStatus } = useMcpServer(
    integration?.mcpServerId?.toString(),
  )

  useEffect(() => {
    if (mcpServer) {
      const interval = setInterval(() => {
        updateMcpServerStatus({ mcpServerId: mcpServer.id })
      }, 30000)

      return () => clearInterval(interval)
    }
  }, [mcpServer?.id, updateMcpServerStatus])

  return <McpServerStatus short mcpServer={mcpServer} />
}
