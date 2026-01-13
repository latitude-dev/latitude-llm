'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Modal, CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { WorkspaceRoles } from '@latitude-data/core/permissions/workspace'
import { useFormAction } from '$/hooks/useFormAction'
import { SerializedWorkspaceUser } from '$/stores/users'
import type { ExecuteFn } from '$/hooks/useLatitudeAction'

const roleOptions = WorkspaceRoles.map((role) => ({
  label: role === 'admin' ? 'Admin' : 'Annotator',
  value: role,
}))

type EditRoleModalProps = {
  open: boolean
  setOpen: (open: boolean) => void
  user: SerializedWorkspaceUser | null
  onSubmit: ExecuteFn<any, any>
}

export default function EditRoleModal({
  open,
  setOpen,
  user,
  onSubmit,
}: EditRoleModalProps) {
  const { isPending, error, data, action } = useFormAction(onSubmit, {
    onSuccess: () => setOpen(false),
  })

  if (!user) return null

  const submittedRole = (data as { role?: string } | undefined)?.role
  const defaultRole = submittedRole ?? user.role ?? WorkspaceRoles[0]
  const roleErrors = (
    error as { fieldErrors?: { role?: string[] } } | undefined
  )?.fieldErrors?.role

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={setOpen}
      title='Edit role'
      description='Change the permissions for this member.'
      footer={
        <>
          <CloseTrigger />
          <Button
            disabled={isPending}
            fancy
            form='updateMembershipRole'
            type='submit'
          >
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <form id='updateMembershipRole' action={action}>
        <input type='hidden' name='userId' value={user.id} />
        <FormWrapper>
          <Select
            required
            label='Role'
            name='role'
            options={roleOptions}
            errors={roleErrors}
            defaultValue={defaultRole}
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
