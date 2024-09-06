'use client'

import { useState } from 'react'

import { type ProviderApiKey } from '@latitude-data/core/browser'
import {
  Button,
  Icon,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import useUsers from '$/stores/users'
import Link from 'next/link'

import NewApiKey from './New'

export default function ProviderApiKeys() {
  const { data: providerApiKeys } = useProviderApiKeys()
  const [open, setOpen] = useState(false)

  return (
    <div className='flex flex-col gap-4'>
      <NewApiKey open={open} setOpen={setOpen} />
      <div className='flex flex-row items-center justify-between'>
        <Text.H4B>Providers</Text.H4B>
        <Button fancy variant='outline' onClick={() => setOpen(true)}>
          Create Provider
        </Button>
      </div>
      <div className='flex flex-col gap-2'>
        {providerApiKeys.length > 0 && (
          <ProviderApiKeysTable providerApiKeys={providerApiKeys} />
        )}
        {providerApiKeys.length === 0 && (
          <TableBlankSlate
            description='There are no providers yet. Create one to start working with your prompts.'
            link={
              <TableBlankSlate.Button onClick={() => setOpen(true)}>
                Create one
              </TableBlankSlate.Button>
            }
          />
        )}
      </div>
    </div>
  )
}

const ProviderApiKeysTable = ({
  providerApiKeys,
}: {
  providerApiKeys: ProviderApiKey[]
}) => {
  const { data: users } = useUsers()
  const findUser = (id: string) => users.find((u) => u.id === id)

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>ID</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Token</TableHead>
          <TableHead>Created at</TableHead>
          <TableHead>Last Used</TableHead>
          <TableHead>Author</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {providerApiKeys.map((apiKey) => (
          <TableRow key={apiKey.id} verticalPadding>
            <TableCell>
              <Text.H4>{apiKey.name}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>{apiKey.provider}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>{apiKey.token}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {apiKey.createdAt.toDateString()}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {relativeTime(apiKey.lastUsedAt)}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {findUser(apiKey.authorId)?.name}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Link
                href={ROUTES.settings.providerApiKeys.destroy(apiKey.id).root}
              >
                <Icon name='trash' />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
