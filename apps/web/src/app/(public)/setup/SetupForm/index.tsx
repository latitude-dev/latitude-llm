'use client'

import { ReactNode } from 'react'

import { Button, FormWrapper, Input, useToast } from '@latitude-data/web-ui'
import { setupAction } from '$/actions/user/setupAction'
import { useFormAction } from '$/hooks/useFormAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'

export default function SetupForm({
  email,
  name,
  companyName,
  footer,
  returnTo,
}: {
  footer: ReactNode
  email?: string
  name?: string
  companyName?: string
  returnTo?: string
}) {
  const { toast } = useToast()
  const { execute, isPending } = useLatitudeAction(setupAction)
  const { error, action, data } = useFormAction(execute, {
    onError: (err) => {
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
    <form action={action}>
      <input type='hidden' name='returnTo' value={returnTo} />
      <FormWrapper>
        <Input
          autoFocus
          required
          name='name'
          autoComplete='name'
          label='Name'
          placeholder='Jon Snow'
          // @ts-expect-error
          errors={errors?.name}
          defaultValue={data?.name || name}
        />
        <Input
          required
          name='email'
          autoComplete='email'
          label='Email'
          placeholder='jon@winterfell.com'
          // @ts-expect-error
          errors={errors?.email}
          defaultValue={data?.email || email}
        />
        <Input
          required
          name='companyName'
          label='Workspace Name'
          placeholder='Acme Inc.'
          // @ts-expect-error
          errors={errors?.companyName}
          defaultValue={data?.companyName || companyName}
        />
        <Button fullWidth isLoading={isPending} fancy>
          Create account
        </Button>

        {footer}
      </FormWrapper>
    </form>
  )
}
