'use client'

import { ReactNode } from 'react'

import { Button, FormWrapper, Input, useToast } from '@latitude-data/web-ui'
import { loginAction } from '$/actions/user/loginAction'
import { useServerAction } from 'zsa-react'

export default function LoginForm({
  footer,
  returnTo,
}: {
  footer: ReactNode
  returnTo?: string
}) {
  const { toast } = useToast()
  const { isPending, error, executeFormAction } = useServerAction(loginAction, {
    onError: ({ err }) => {
      if (err.code === 'ERROR') {
        toast({
          title: 'Error',
          description: err.message,
          variant: 'destructive',
        })
      }
    },
  })
  const errors = error?.fieldErrors
  return (
    <form action={executeFormAction}>
      <input type='hidden' name='returnTo' value={returnTo} />
      <FormWrapper>
        <Input
          autoFocus
          name='email'
          autoComplete='email'
          label='Email'
          placeholder='Ex.: jon@example.com'
          errors={errors?.email}
        />
        <Button fullWidth isLoading={isPending && !error}>
          Login
        </Button>

        {footer}
      </FormWrapper>
    </form>
  )
}
