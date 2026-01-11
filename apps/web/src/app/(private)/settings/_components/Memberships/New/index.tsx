import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { WorkspaceRoles } from '@latitude-data/core/permissions/workspace'
import { useFormAction } from '$/hooks/useFormAction'
import useUsers from '$/stores/users'

const roleOptions = WorkspaceRoles.map((role) => ({
  label: role === 'admin' ? 'Admin' : 'Annotator',
  value: role,
}))

export default function NewUser({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { invite } = useUsers()
  const { isPending, error, data, action } = useFormAction(invite, {
    onSuccess: () => setOpen(false),
  })
  const defaultRole = (data as { role?: string } | undefined)?.role ?? 'admin'

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={setOpen}
      title='Add New User'
      description='Add a new user to this workspace.'
      footer={
        <>
          <CloseTrigger />
          <Button
            disabled={isPending}
            fancy
            form='createUserform'
            type='submit'
          >
            {isPending ? 'Sending...' : 'Send invite'}
          </Button>
        </>
      }
    >
      <form id='createUserform' action={action}>
        <FormWrapper>
          <Input
            required
            type='text'
            label='Name'
            name='name'
            errors={error?.fieldErrors?.name}
            defaultValue={data?.name ?? ''}
            placeholder='Jon Snow'
          />
          <Input
            required
            type='text'
            label='Email'
            name='email'
            errors={error?.fieldErrors?.email}
            defaultValue={data?.email}
            placeholder='jon@latitude.so'
          />
          <Select
            required
            label='Role'
            name='role'
            options={roleOptions}
            defaultValue={defaultRole}
            errors={
              (error as { fieldErrors?: { role?: string[] } } | undefined)
                ?.fieldErrors?.role
            }
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
