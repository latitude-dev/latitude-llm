'use client'

import { Button, useToast } from '@latitude-data/web-ui'
import { logoutAction } from '$/actions/user/logoutAction'
import { useServerAction } from 'zsa-react'

export default function DummyLogoutButton() {
  const { toast } = useToast()
  const { executeFormAction } = useServerAction(logoutAction, {
    onError: ({ err }) => {
      if (err.code === 'ERROR') {
        toast({
          title: 'Error while logging out',
          description: err.message,
          variant: 'destructive',
        })
      }
    },
  })
  return (
    <form action={executeFormAction}>
      <Button>Logout</Button>
    </form>
  )
}
