'use client'

import useIntegrations from '$/stores/integrations'
import { IntegrationType } from '@latitude-data/constants'
import type { IntegrationDto } from '@latitude-data/core/browser'
import { PipedreamIntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { cn } from '@latitude-data/web-ui/utils'
import Image from 'next/image'
import { useColumn1Context } from '../contexts/column-1-context'
import { useTriggersModalContext } from '../contexts/triggers-modal-context'

export function ConnectedIntegrations() {
  const { data: integrations, isLoading } = useIntegrations({
    withTriggers: true,
  })
  const { searchQuery } = useColumn1Context()

  // Filter only Pipedream integrations and apply search query filter
  const pipedreamIntegrations = integrations.filter(
    (integration: IntegrationDto) => {
      if (integration.type !== IntegrationType.Pipedream) return false
      if (!searchQuery) return true

      const query = searchQuery.toLowerCase()
      return (
        integration.name.toLowerCase().includes(query) ||
        integration.configuration!.appName.toLowerCase().includes(query)
      )
    },
  )

  if (isLoading) {
    return (
      <div className='flex flex-col gap-2'>
        <Text.H5M>Connected Integrations</Text.H5M>
        <TableSkeleton cols={1} rows={4} verticalPadding />
      </div>
    )
  }
  if (!pipedreamIntegrations.length) return null

  return (
    <div className='flex flex-col gap-2'>
      <Text.H5M>Connected Integrations</Text.H5M>
      <div className='w-full overflow-hidden'>
        <Table className='w-full table-fixed'>
          <TableBody>
            {pipedreamIntegrations.map((integration: IntegrationDto) => (
              <ConnectedIntegration
                key={integration.id}
                integration={integration}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ConnectedIntegration({
  integration,
}: {
  integration: IntegrationDto
}) {
  const { setSelectedIntegration, selectedIntegration } =
    useTriggersModalContext()
  const configuration =
    integration.configuration as PipedreamIntegrationConfiguration

  return (
    <TableRow
      key={integration.id}
      className={cn('cursor-pointer', {
        'bg-accent': selectedIntegration?.id === integration.id,
      })}
      onClick={() => {
        setSelectedIntegration({
          id: integration.id,
          name: integration.name,
          type: IntegrationType.Pipedream,
          pipedream: {
            app: {
              name: configuration.appName,
            },
          },
        })
      }}
      verticalPadding
    >
      <TableCell className='p-0 pl-2 w-12'>
        <Image
          src={configuration.metadata?.imageUrl ?? ''}
          alt={configuration.metadata?.displayName ?? ''}
          width={40}
          height={40}
        />
      </TableCell>
      <TableCell>
        <div className='flex flex-col gap-1 max-w-full'>
          <Text.H4M>{integration.name}</Text.H4M>
          <div className='truncate'>
            <Text.H5 noWrap color='foregroundMuted'>
              {configuration.appName}
            </Text.H5>
          </div>
        </div>
      </TableCell>
      <TableCell className='p-0 pr-2 w-6'>
        <div className='flex items-center justify-center w-full'>
          <Icon name='arrowRight' color='foregroundMuted' />
        </div>
      </TableCell>
    </TableRow>
  )
}
