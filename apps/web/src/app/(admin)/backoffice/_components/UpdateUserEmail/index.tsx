import { updateUserAction } from '$/actions/admin/users/updateUserAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { Button, FormWrapper, Input } from '@latitude-data/web-ui'
import { FormEvent, useCallback } from 'react'
export function UpdateUserEmail() {
  const router = useNavigate()
  const { execute, isPending } = useLatitudeAction(updateUserAction)
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)
      const userEmail = formData.get('userEmail')?.toString()
      if (!userEmail) return

      const email = formData.get('email')?.toString() ?? userEmail

      await execute({ userEmail, email })
      router.push(ROUTES.backoffice.root)
    },
    [execute, router],
  )
  return (
    <form onSubmit={handleSubmit}>
      <FormWrapper>
        <Input
          label='User email'
          name='userEmail'
          placeholder='Current user email'
        />
        <Input label='New email' name='email' placeholder='New user email' />
        <Button type='submit' disabled={isPending}>
          Update
        </Button>
      </FormWrapper>
    </form>
  )
}
