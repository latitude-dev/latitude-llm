import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { IntegrationType } from '@latitude-data/constants'
import type { IntegrationDto } from '@latitude-data/core/browser'
import Image from 'next/image'
import { PipedreamIntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { cn } from '@latitude-data/web-ui/utils'
import {
  PipedreamSlug,
  useTriggersModalContext,
} from '../contexts/triggers-modal-context'
import { useIntegrationsListContext } from './IntegrationsListProvider'

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
            name_slug: configuration.appName as unknown as PipedreamSlug,
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

export function ConnectedIntegrations() {
  const { connectedIntegrations, isLoadingConnectedIntegrations } =
    useIntegrationsListContext()

  if (isLoadingConnectedIntegrations) {
    return (
      <div className='flex flex-col gap-2'>
        <Text.H5M>Connected Integrations</Text.H5M>
        <TableSkeleton cols={1} rows={4} verticalPadding />
      </div>
    )
  }

  if (!connectedIntegrations.length) return null

  return (
    <div className='flex flex-col gap-2'>
      <Text.H5M>Connected Integrations</Text.H5M>
      <div className='w-full overflow-hidden'>
        <Table className='w-full table-fixed'>
          <TableBody>
            {connectedIntegrations.map((integration: IntegrationDto) => (
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
