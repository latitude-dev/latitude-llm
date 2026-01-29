'use client'
import { ReactNode } from 'react'

import { loginAction } from '$/actions/user/loginAction'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useFormAction } from '$/hooks/useFormAction'

export default function LoginForm({
  footer,
  returnTo,
}: {
  footer: ReactNode
  returnTo?: string
}) {
  const { toast } = useToast()
  const { isPending, execute } = useLatitudeAction(loginAction)
  const { error, action } = useFormAction(execute, {
    onError: (error) => {
      if (error.code === 'ERROR') {
        toast({
          title: 'Error',
          description: error.message,
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
          name='email'
          autoComplete='email'
          label='Email'
          placeholder='Ex.: jon@example.com'
          errors={errors?.email}
        />
        <div className='flex flex-col gap-6'>
          <Button fancy fullWidth isLoading={isPending && !error}>
            Login
          </Button>

          <div className='relative'>
            <Separator />
            <div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
              <div className='bg-background px-2'>
                <Text.H6 color='foregroundMuted'>Or</Text.H6>
              </div>
            </div>
          </div>

          <Button variant='outline' fullWidth asChild>
            <a
              href={
                '/api/auth/google/start' +
                (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '')
              }
              className='flex items-center gap-2'
            >
              <Icon name='googleWorkspace' />
              <Text.H5>Continue with Google</Text.H5>
            </a>
          </Button>
        </div>

        {footer}
      </FormWrapper>
    </form>
  )
}
