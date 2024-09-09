'use client'

import { ReactNode } from 'react'

import { Button, FormWrapper, Input, useToast } from '@latitude-data/web-ui'
import { setupAction } from '$/actions/user/setupAction'
import { useServerAction } from 'zsa-react'

export default function SetupForm({
  email,
  name,
  companyName,
  footer,
}: {
  email?: string
  name?: string
  companyName?: string
  footer: ReactNode
}) {
  const { toast } = useToast()
  const { isPending, error, executeFormAction } = useServerAction(setupAction, {
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
          name='name'
          autoComplete='name'
          label='Name'
          placeholder='Jon Snow'
          errors={errors?.name}
          defaultValue={name}
        />
        <Input
          name='email'
          autoComplete='email'
          label='Email'
          placeholder='jon@winterfell.com'
          errors={errors?.email}
          defaultValue={email}
        />
        <Input
          name='companyName'
          label='Workspace Name'
          placeholder='Acme Inc.'
          errors={errors?.companyName}
          defaultValue={companyName}
        />
        <Button fullWidth isLoading={isPending} fancy>
          Create account
        </Button>

        {footer}
      </FormWrapper>
    </form>
  )
}
