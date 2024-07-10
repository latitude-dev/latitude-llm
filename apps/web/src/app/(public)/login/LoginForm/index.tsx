'use client'

import { ReactNode } from 'react'

import { Button, FormWrapper, Input, useToast } from '@latitude-data/web-ui'
import { loginAction } from '$/actions/user/loginAction'
import { useServerAction } from 'zsa-react'

export default function LoginForm({ footer }: { footer: ReactNode }) {
  const { toast } = useToast()
  const { isPending, error, executeFormAction } = useServerAction(loginAction, {
    onError: ({ err }) => {
      if (err.code === 'ERROR') {
        toast({
          title: 'Saving failed',
          description: err.message,
          variant: 'destructive',
        })
      }
    },
  })
  const errors = error?.fieldErrors
  return (
    <form action={executeFormAction}>
      <FormWrapper>
        <Input
          autoFocus
          name='email'
          autoComplete='email'
          label='Email'
          placeholder='Ex.: jon@example.com'
          errors={errors?.email}
        />
        <Input
          name='password'
          autoComplete='new-password'
          type='password'
          label='Password'
          placeholder='Write a secure password'
          errors={errors?.password}
        />
        <Button fullWidth isLoading={isPending}>
          Login
        </Button>

        {footer}
      </FormWrapper>
    </form>
  )
}
