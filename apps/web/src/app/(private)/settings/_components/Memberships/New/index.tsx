import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useFormAction } from '$/hooks/useFormAction'
import useUsers from '$/stores/users'
import { InviteUserOutcome } from '@latitude-data/core/services/users/invite'

export default function NewUser({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { invite } = useUsers()
  const { toast } = useToast()
  const { data, action } = useFormAction(invite, {
    onSuccess: (result: InviteUserOutcome | undefined) => { // Add type to result
      setOpen(false)
      if (result?.status === 'invitation_created') {
        toast({
          title: 'Invitation Sent',
          description: `An invitation has been sent to ${result.invitation.email}.`,
        })
      } else if (result?.status === 'user_added_to_workspace') {
        toast({
          title: 'User Added',
          description: `${result.user.email} has been added to the workspace.`,
        })
      }
    },
    onError: (error) => { // Optional: Add specific error handling for invite if needed
      toast({
        title: 'Invite Failed',
        description: error.message || 'Could not process the invitation.',
        variant: 'destructive',
      })
    }
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
