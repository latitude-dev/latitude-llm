'use client'

import { UpdateUserEmail } from '$/app/(admin)/backoffice/_components/UpdateUserEmail'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export default function AdminUsers() {
  return (
    <div className='container flex flex-col gap-y-4'>
      <Text.H1>Update user email</Text.H1>
      <UpdateUserEmail />
    </div>
  )
}
