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
import useUsers, { SerializedWorkspaceUser } from '$/stores/users'
import Link from 'next/link'

import NewUser from './New'
import EditRoleModal from './RoleModal'
import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  annotator: 'Annotator',
}

export default function Memberships() {
  const [open, setOpen] = useState(false)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] =
    useState<SerializedWorkspaceUser | null>(null)
  const { data: users, isLoading, updateRole } = useUsers()

  const handleRoleModalChange = (openRoleModal: boolean) => {
    setIsRoleModalOpen(openRoleModal)
    if (!openRoleModal) setSelectedUser(null)
  }

  return (
    <div className='flex flex-col gap-4'>
      <NewUser open={open} setOpen={setOpen} />
      <EditRoleModal
        open={isRoleModalOpen}
        setOpen={handleRoleModalChange}
        user={selectedUser}
        onSubmit={updateRole}
      />
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
        {users.length > 0 && (
          <UsersTable
            users={users}
            onEditRole={(user) => {
              setSelectedUser(user)
              setIsRoleModalOpen(true)
            }}
          />
        )}
        {isLoading && <TableSkeleton cols={5} rows={3} />}
      </div>
    </div>
  )
}

function UsersTable({
  users,
  onEditRole,
}: {
  users: SerializedWorkspaceUser[]
  onEditRole: (user: SerializedWorkspaceUser) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Confirmed At</TableHead>
          <TableHead className='text-right'>Actions</TableHead>
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
                {roleLabel[user.role] ?? user.role}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {relativeTime(user.confirmedAt ? user.confirmedAt : null)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <div className='flex flex-row gap-3 items-center justify-end'>
                <Button
                  variant='ghost'
                  size='small'
                  iconProps={{ name: 'pencil', placement: 'left' }}
                  onClick={() => onEditRole(user)}
                >
                  Edit role
                </Button>
                <Link href={ROUTES.settings.users.destroy(user.id).root}>
                  <Icon name='trash' />
                </Link>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
