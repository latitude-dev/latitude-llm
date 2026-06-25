'use client'

import { useRouter } from 'next/navigation'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { setUserAdminAction } from '$/actions/admin/users/setUserAdminAction'

type Props = {
  userEmail: string
  isAdmin: boolean
}

export function AdminToggle({ userEmail, isAdmin }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const { execute, isPending } = useLatitudeAction(setUserAdminAction, {
    onSuccess: ({ data }) => {
      toast({
        title: 'Admin access updated',
        description: data.admin
          ? `${data.email} is now an admin`
          : `${data.email} is no longer an admin`,
      })
      router.refresh()
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update admin access',
        variant: 'destructive',
      })
      router.refresh()
    },
  })

  return (
    <div className='flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg'>
      <div className='flex flex-col gap-1'>
        <Text.H5>Admin Access</Text.H5>
        <Text.H6 color='foregroundMuted'>
          Grant or revoke platform admin (backoffice) access
        </Text.H6>
      </div>
      <SwitchToggle
        checked={isAdmin}
        disabled={isPending}
        onCheckedChange={(checked) => execute({ userEmail, admin: checked })}
      />
    </div>
  )
}
