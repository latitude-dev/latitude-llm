'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import useUsers from '$/stores/users'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { publishEventAction } from '$/actions/events/publishEventAction'
import { useCallback, useState } from 'react'

function NewUserRow({
  onInviteUser,
}: {
  onInviteUser: (name: string, email: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const handleSubmit = useCallback(() => {
    if (!name || !email) return
    onInviteUser(name, email)
    setName('')
    setEmail('')
  }, [name, email, onInviteUser])

  return (
    <TableRow>
      <TableCell className='py-2 pl-3 pr-0'>
        <Input
          type='text'
          placeholder='Name'
          name='name'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </TableCell>
      <TableCell className='py-2 px-3'>
        <div className='flex flex-row gap-2 w-full'>
          <Input
            type='email'
            placeholder='Email'
            name='email'
            className='w-full'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            type='submit'
            form='inviteDeveloperForm'
            onClick={handleSubmit}
          >
            Invite
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function InviteDeveloperModal({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { data: workspace } = useCurrentWorkspace()
  const { data: users, isLoading, invite } = useUsers()
  const { execute: publishEvent } = useLatitudeAction(publishEventAction)

  const onInviteUser = useCallback(
    (name: string, email: string) => {
      invite({ name, email })
      publishEvent({
        eventType: 'onboardingUserInvited',
        payload: { invitedEmail: email },
      })
    },
    [invite, publishEvent],
  )

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={setOpen}
      size='large'
      title={`Invite others to ${workspace?.name ?? 'this workspace'}`}
      description='Invite a developer to help integrate Latitude into your project.'
      footer={<CloseTrigger />}
    >
      <div className='flex flex-col gap-6'>
        {isLoading && <TableSkeleton cols={['Name', 'Email']} rows={3} />}
        {!isLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className='py-3'>
                    <Text.H5>{user.name}</Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 color='foregroundMuted'>{user.email}</Text.H5>
                  </TableCell>
                </TableRow>
              ))}
              <NewUserRow onInviteUser={onInviteUser} />
            </TableBody>
          </Table>
        )}
      </div>
    </Modal>
  )
}
