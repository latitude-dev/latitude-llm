'use client'

import { useState } from 'react'

import { type ProviderApiKey } from '@latitude-data/core/browser'
import useProviderApiKeys from '$/stores/providerApiKeys'
import useUsers from '$/stores/users'
import {
  Button,
  Icons,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '$ui/ds/atoms'

import NewApiKey from './New'

export default function ProviderApiKeys() {
  const { data: providerApiKeys, destroy } = useProviderApiKeys()
  const [open, setOpen] = useState(false)

  return (
    <div className='flex flex-col gap-4'>
      <NewApiKey open={open} setOpen={setOpen} />
      <div className='flex flex-row items-center justify-between'>
        <Text.H4B>LLM API Keys</Text.H4B>
        <Button variant='outline' onClick={() => setOpen(true)}>
          Add new API Key
        </Button>
      </div>
      <div className='flex flex-col gap-2'>
        {providerApiKeys.length > 0 && (
          <ProviderApiKeysTable
            providerApiKeys={providerApiKeys}
            destroy={destroy}
          />
        )}
        {providerApiKeys.length === 0 && (
          <div className='rounded-lg w-full py-12 flex flex-col gap-4 items-center justify-center bg-secondary'>
            <div className='max-w-[50%]'>
              <Text.H5 centered display='block' color='foregroundMuted'>
                There are no API Keys yet. Create one to start working with your
                prompts.
              </Text.H5>
            </div>
            <Button onClick={() => setOpen(true)}>Create one</Button>
          </div>
        )}
      </div>
    </div>
  )
}

const ProviderApiKeysTable = ({
  providerApiKeys,
  destroy,
}: {
  providerApiKeys: ProviderApiKey[]
  destroy: Function
}) => {
  const { data: users } = useUsers()
  const findUser = (id: string) => users.find((u) => u.id === id)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
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
          <TableRow key={apiKey.id}>
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
                {apiKey.lastUsedAt?.toISOString() || 'never'}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {findUser(apiKey.authorId)?.name}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Button
                size='small'
                variant='linkDestructive'
                onClick={() => destroy({ id: apiKey.id })}
              >
                <Icons.trash />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
