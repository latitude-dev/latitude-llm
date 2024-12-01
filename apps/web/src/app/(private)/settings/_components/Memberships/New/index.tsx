import {
  Button,
  CloseTrigger,
  FormWrapper,
  Input,
  Modal,
} from '@latitude-data/web-ui'
import { useFormAction } from '$/hooks/useFormAction'
import useUsers from '$/stores/users'

export default function NewUser({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { invite } = useUsers()
  const { data, action } = useFormAction(invite, {
    onSuccess: () => setOpen(false),
  })
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
          <Button fancy form='createUserform' type='submit'>
            Send invite
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
            defaultValue={data?.name}
            placeholder='Jon Snow'
          />
          <Input
            required
            type='email'
            label='Email'
            name='email'
            defaultValue={data?.email}
            placeholder='jon@latitude.so'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
