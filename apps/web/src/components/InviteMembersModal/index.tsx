'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
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
import { useCallback, useState } from 'react'

type PendingInvite = {
  id: string
  name: string
  email: string
  status: 'pending' | 'success' | 'error'
}

function NewUserRow({
  onInviteUser,
  isInviting,
}: {
  onInviteUser: (name: string, email: string) => void
  isInviting: boolean
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
          disabled={isInviting}
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
            disabled={isInviting}
          />
          <Button
            type='submit'
            form='inviteDeveloperForm'
            onClick={handleSubmit}
            disabled={isInviting || !name || !email}
          >
            {isInviting ? 'Inviting...' : 'Invite'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function PendingInviteRow({ invite }: { invite: PendingInvite }) {
  return (
    <TableRow className='bg-muted/50'>
      <TableCell className='py-3'>
        <Text.H5>{invite.name}</Text.H5>
      </TableCell>
      <TableCell>
        <div className='flex items-center justify-between gap-4'>
          <Text.H5 color='foregroundMuted'>{invite.email}</Text.H5>
          {invite.status === 'pending' && (
            <Icon
              name='loader'
              className='animate-spin'
              color='foregroundMuted'
            />
          )}
          {invite.status === 'success' && <Icon name='check' color='success' />}
          {invite.status === 'error' && (
            <Icon name='alert' color='destructive' />
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function InviteMembersModal({
  open,
  setOpen,
  onContinue,
  showContinueButton = false,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  onContinue?: () => void
  showContinueButton?: boolean
}) {
  const { data: workspace } = useCurrentWorkspace()
  const { data: users, isLoading, invite } = useUsers()
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [hasInvitedAny, setHasInvitedAny] = useState(false)

  const onInviteUser = useCallback(
    async (name: string, email: string) => {
      const inviteId = `${email}-${Date.now()}`

      setPendingInvites((prev) => [
        ...prev,
        { id: inviteId, name, email, status: 'pending' },
      ])

      try {
        await invite({ name, email })
        setPendingInvites((prev) =>
          prev.map((p) =>
            p.id === inviteId ? { ...p, status: 'success' as const } : p,
          ),
        )
        setHasInvitedAny(true)

        setTimeout(() => {
          setPendingInvites((prev) => prev.filter((p) => p.id !== inviteId))
        }, 2000)
      } catch {
        setPendingInvites((prev) =>
          prev.map((p) =>
            p.id === inviteId ? { ...p, status: 'error' as const } : p,
          ),
        )
      }
    },
    [invite],
  )

  const isInviting = pendingInvites.some((p) => p.status === 'pending')

  const visiblePendingInvites = pendingInvites.filter(
    (p) => !users.some((u) => u.email === p.email),
  )

  const handleContinue = useCallback(() => {
    setOpen(false)
    onContinue?.()
  }, [setOpen, onContinue])

  const footer = showContinueButton ? (
    <div className='flex items-center justify-between w-full'>
      <CloseTrigger />
      {hasInvitedAny && (
        <Button variant='default' fancy onClick={handleContinue}>
          Continue to Latitude
        </Button>
      )}
    </div>
  ) : (
    <CloseTrigger />
  )

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={setOpen}
      size='large'
      title={`Invite others to ${workspace?.name ?? 'this workspace'}`}
      description='Invite a developer to help integrate Latitude into your project.'
      footer={footer}
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
              {visiblePendingInvites.map((invite) => (
                <PendingInviteRow key={invite.id} invite={invite} />
              ))}
              <NewUserRow onInviteUser={onInviteUser} isInviting={isInviting} />
            </TableBody>
          </Table>
        )}
      </div>
    </Modal>
  )
}
