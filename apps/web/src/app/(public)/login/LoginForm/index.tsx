'use client'
import { ReactNode } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { loginAction } from '$/actions/user/loginAction'
import { useServerAction } from 'zsa-react'
import Link from 'next/link'
import { Text } from '@latitude-data/web-ui/atoms/Text'

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
        <div className='flex flex-col gap-6'>
          <Button fullWidth isLoading={isPending && !error}>
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
            <Link
              href='/api/auth/google/start'
              className='flex items-center gap-2'
            >
              <Icon name='googleWorkspace' />
              <Text.H5>Continue with Google</Text.H5>
            </Link>
          </Button>
        </div>

        {footer}
      </FormWrapper>
    </form>
  )
}
