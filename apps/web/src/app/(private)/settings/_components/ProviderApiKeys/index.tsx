'use client'

import { useState } from 'react'

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
  const { data: users } = useUsers()
  const { data: providerApiKeys, destroy } = useProviderApiKeys()
  const [open, setOpen] = useState(false)

  const findUser = (id: string) => users.find((u) => u.id === id)

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
      </div>
    </div>
  )
}
