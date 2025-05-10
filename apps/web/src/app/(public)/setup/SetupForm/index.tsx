'use client'
import { ReactNode } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { setupAction } from '$/actions/user/setupAction'
import { useFormAction } from '$/hooks/useFormAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import Link from 'next/link'
import Cookies from 'js-cookie' // For setting cookie

export default function SetupForm({
  email,
  name,
  companyName,
  footer,
  returnTo,
  invitationToken,
}: {
  footer: ReactNode
  email?: string
  name?: string
  companyName?: string
  returnTo?: string
  invitationToken?: string
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
      {invitationToken && (
        <input type='hidden' name='invitationToken' value={invitationToken} />
      )}
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
        <div className='flex flex-col gap-6'>
          <Button fullWidth isLoading={isPending} fancy>
            Create account
          </Button>

          <div className='relative'>
            <Separator />
            <div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
              <div className='bg-background px-2'>
                <Text.H6 color='foregroundMuted'>Or</Text.H6>
              </div>
            </div>
          </div>

          <Button
            variant='outline'
            fullWidth
            asChild
            onClick={() => {
              if (invitationToken) {
                Cookies.set('latitude_invitation_token', invitationToken, {
                  path: '/',
                  sameSite: 'lax',
                  // secure: process.env.NODE_ENV === 'production', // Enable in production
                  expires: 1 / 24 / 2, // Expires in 30 minutes
                })
              }
            }}
          >
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
