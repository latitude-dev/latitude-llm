'use client'
import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useUsers from '$/stores/users'
import Link from 'next/link'
import { User } from '@latitude-data/core/schema/models/types/User'

import NewUser from './New'
import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'

export default function Memberships() {
  const [open, setOpen] = useState(false)
  const { data: users, isLoading } = useUsers()

  return (
    <div className='flex flex-col gap-4'>
      <NewUser open={open} setOpen={setOpen} />
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-row items-center gap-2'>
          <Text.H4B>Workspace Members</Text.H4B>
          <OpenInDocsButton route={DocsRoute.Invite} />
        </div>
        <Button fancy variant='outline' onClick={() => setOpen(true)}>
          Add Member
        </Button>
      </div>
      <div className='flex flex-col gap-2'>
        {users.length > 0 && <UsersTable users={users} />}
        {isLoading && <TableSkeleton cols={4} rows={3} />}
      </div>
    </div>
  )
}

function UsersTable({ users }: { users: User[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Confirmed At</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id} verticalPadding hoverable={false}>
            <TableCell>
              <Text.H5>{user.name}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>{user.email}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {relativeTime(user.confirmedAt ? user.confirmedAt : null)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Link href={ROUTES.settings.users.destroy(user.id).root}>
                <Icon name='trash' />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
