'use client'
import { ReactNode } from 'react'

import { setupAction } from '$/actions/user/setupAction'
import { useFormAction } from '$/hooks/useFormAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import Link from 'next/link'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { USER_TITLES, UserTitle } from '@latitude-data/constants/users'

export const humanizeUserTitle = (title: UserTitle): string => {
  switch (title) {
    case UserTitle.Engineer:
      return 'Engineer'
    case UserTitle.DataAIAndML:
      return 'Data/AI/ML'
    case UserTitle.ProductManager:
      return 'Product Manager'
    case UserTitle.Designer:
      return 'Designer'
    case UserTitle.Founder:
      return 'Founder'
    case UserTitle.Other:
      return 'Other'
  }
}

export default function SetupForm({
  email,
  name,
  companyName,
  footer,
  source,
  returnTo,
}: {
  footer: ReactNode
  email?: string
  name?: string
  companyName?: string
  source?: string
  returnTo?: string
}) {
  const { toast } = useToast()
  const { execute, isPending } = useLatitudeAction(setupAction)
  const { data, error, action } = useFormAction(execute, {
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
      <input type='hidden' name='source' value={source} />
      <FormWrapper>
        <Input
          autoFocus
          required
          name='name'
          autoComplete='name'
          label='Name'
          placeholder='Jon Snow'
          errors={errors?.name}
          defaultValue={data?.name || name}
        />
        <Input
          required
          name='email'
          autoComplete='email'
          label='Email'
          placeholder='jon@winterfell.com'
          errors={errors?.email}
          defaultValue={data?.email || email}
        />
        <Input
          required
          name='companyName'
          label='Workspace Name'
          placeholder='Acme Inc.'
          errors={errors?.companyName}
          defaultValue={data?.companyName || companyName}
        />
        <Select
          required
          name='title'
          label='Your role'
          errors={errors?.title}
          placeholder='Select'
          options={USER_TITLES.map((title: UserTitle) => ({
            label: humanizeUserTitle(title),
            value: title,
          }))}
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

          <Button variant='outline' fullWidth asChild>
            <Link
              href={
                '/api/auth/google/start' +
                (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '')
              }
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
