'use client'

import { ImpersonateUser } from '$/app/(admin)/backoffice/_components/ImpersonateUser'
import { UpdateUserEmail } from '$/app/(admin)/backoffice/_components/UpdateUserEmail'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export default function AdminUsers() {
  return (
    <div className='container flex flex-col gap-y-8'>
      <section className='flex flex-col gap-y-4'>
        <Text.H1>Update user email</Text.H1>
        <UpdateUserEmail />
      </section>

      <section className='flex flex-col gap-y-4'>
        <Text.H1>Impersonate User</Text.H1>
        <Text.H4>This will allow you to access the application as the specified user.</Text.H4>
        <Text.H4B>Use it ONLY for SUPPORT purposes after ACKNOWLEDGEMENT from the user.</Text.H4B>
        <ImpersonateUser />
      </section>
    </div>
  )
}
