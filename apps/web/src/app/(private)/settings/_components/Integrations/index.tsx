'use client'

import { type Integration } from '@latitude-data/core/browser'
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
import useIntegrations from '$/stores/integrations'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
                <TableBlankSlate.Button>Create one</TableBlankSlate.Button>
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
  integrations: Integration[]
}) => {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Last Used</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {integrations.map((integration) => (
          <TableRow key={integration.id} hoverable={false} verticalPadding>
            <TableCell>
              <Text.H5>{integration.name}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>{integration.type}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {relativeTime(
                  integration.lastUsedAt ? integration.lastUsedAt : null,
                )}
              </Text.H5>
            </TableCell>
            <TableCell>
              <DropdownMenu
                options={[
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
        ))}
      </TableBody>
    </Table>
  )
}
