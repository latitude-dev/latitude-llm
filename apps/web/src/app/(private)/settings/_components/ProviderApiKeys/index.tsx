'use client'
import {
  Providers,
  Workspace,
  type ProviderApiKey,
} from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
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
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import useProviderApiKeys from '$/stores/providerApiKeys'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ProviderApiKeys() {
  const { data: providerApiKeys, isLoading: isProviderApiKeysLoading } =
    useProviderApiKeys()
  const { data: workspace, isLoading: isWorkspaceLoading } =
    useCurrentWorkspace()
  const isLoading = isProviderApiKeysLoading || isWorkspaceLoading

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H4B>Providers</Text.H4B>
        <Link href={ROUTES.settings.providerApiKeys.new.root}>
          <Button fancy variant='outline'>
            Create Provider
          </Button>
        </Link>
      </div>
      <div className='flex flex-col gap-2'>
        {isLoading && <TableSkeleton cols={6} rows={3} />}
        {!isLoading && providerApiKeys.length > 0 && (
          <ProviderApiKeysTable
            providerApiKeys={providerApiKeys}
            workspace={workspace!}
          />
        )}
        {!isLoading && providerApiKeys.length === 0 && (
          <TableBlankSlate
            description='There are no providers yet. Create one to start working with your prompts.'
            link={
              <Link href={ROUTES.settings.providerApiKeys.new.root}>
                <TableBlankSlate.Button>Create provider</TableBlankSlate.Button>
              </Link>
            }
          />
        )}
      </div>
    </div>
  )
}

const DefaultProviderBadge = ({
  provider,
  className,
}: {
  provider: ProviderApiKey
  className?: string
}) => {
  return (
    <Tooltip
      variant='inverse'
      trigger={
        <Badge variant='accent' className={className}>
          Default
        </Badge>
      }
    >
      <div className='flex flex-col gap-2'>
        <Text.H6 color='background'>
          The provider selected by default in new prompts or evaluations. You
          can choose another provider anytime in the editor.
        </Text.H6>
        {provider.defaultModel && (
          <Text.H6 color='background'>
            The default model is {provider.defaultModel}.
          </Text.H6>
        )}
      </div>
    </Tooltip>
  )
}

const ProviderApiKeysTable = ({
  providerApiKeys,
  workspace,
}: {
  providerApiKeys: ProviderApiKey[]
  workspace: Workspace
}) => {
  const router = useRouter()
  const { updateDefaultProvider } = useCurrentWorkspace()
  const findProvider = (provider: string) =>
    Object.entries(Providers).find(([_, value]) => value === provider)?.[0]

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Token</TableHead>
          <TableHead>Last Used</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {providerApiKeys.map((apiKey) => (
          <TableRow key={apiKey.id} hoverable={false} verticalPadding>
            <TableCell>
              <div className='flex flex-row items-center gap-2'>
                <Text.H5>{apiKey.name}</Text.H5>
                {apiKey.id === workspace.defaultProviderId && (
                  <DefaultProviderBadge provider={apiKey} className='ml-2' />
                )}
              </div>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {findProvider(apiKey.provider)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>{apiKey.token}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {relativeTime(apiKey.lastUsedAt ? apiKey.lastUsedAt : null)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <DropdownMenu
                options={[
                  apiKey.id === workspace.defaultProviderId
                    ? {
                        label: 'Unset as default',
                        onClick: () =>
                          updateDefaultProvider({
                            defaultProviderId: null,
                          }),
                      }
                    : {
                        label: 'Set as default',
                        onClick: () =>
                          updateDefaultProvider({
                            defaultProviderId: apiKey.id,
                          }),
                      },
                  {
                    label: 'Remove',
                    onClick: () =>
                      router.push(
                        ROUTES.settings.providerApiKeys.destroy(apiKey.id).root,
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
