'use client'

import { impersonateAction } from '$/actions/user/impersonateAction'
import { useFormAction } from '$/hooks/useFormAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'

export function ImpersonateUser() {
  const { execute } = useLatitudeAction(impersonateAction)
  const { action } = useFormAction(execute)

  return (
    <form action={action} className='flex flex-col gap-4 max-w-md'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='email'>User Email</Label>
        <Input
          id='email'
          type='email'
          name='email'
          placeholder='user@example.com'
        />
      </div>
      <Button type='submit'>Impersonate User</Button>
    </form>
  )
}
