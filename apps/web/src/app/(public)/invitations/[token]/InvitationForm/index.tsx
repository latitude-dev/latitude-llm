'use client'
import { ReactNode } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { acceptInvitationAction } from '$/actions/invitations/accept'
import { useServerAction } from 'zsa-react'
import { Membership, User } from '@latitude-data/core/schema/types'

export default function InvitationForm({
  user,
  membership,
  footer,
}: {
  user: User
  membership: Membership
  footer: ReactNode
}) {
  const { toast } = useToast()
  const { isPending, error, executeFormAction } = useServerAction(
    acceptInvitationAction,
    {
      onError: ({ err }) => {
        if (err.code === 'ERROR') {
          toast({
            title: 'Saving failed',
            description: err.message,
            variant: 'destructive',
          })
        }
      },
    },
  )
  const errors = error?.fieldErrors

  return (
    <form action={executeFormAction as any}>
      <FormWrapper>
        <Input
          hidden
          readOnly
          name='membershipToken'
          value={membership.invitationToken}
        />
        {!user.confirmedAt && (
          <>
            <Input
              disabled
              value={user.email}
              type='email'
              name='email'
              label='Email'
              errors={errors?.email}
            />
          </>
        )}
        <Button fullWidth isLoading={isPending}>
          Accept Invitation
        </Button>

        {footer}
      </FormWrapper>
    </form>
  )
}
