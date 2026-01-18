import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { findPayingWorkspacesForAdmin } from '$/data-access'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { notFound } from 'next/navigation'
import { BillingList } from './_components/BillingList'

export default async function BillingPage() {
  const { user } = await getCurrentUserOrRedirect()
  if (!user?.admin) return notFound()

  const result = await findPayingWorkspacesForAdmin({ userId: user.id })

  if (result.error) {
    return (
      <div className='container mx-auto p-6 max-w-7xl'>
        <div className='space-y-8'>
          <div className='flex flex-col gap-2'>
            <Text.H1>Billing Management</Text.H1>
            <Text.H5 color='destructive'>
              Error loading workspaces: {result.error.message}
            </Text.H5>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='container mx-auto p-6 max-w-7xl'>
      <div className='space-y-8'>
        <div className='flex flex-col gap-2'>
          <Text.H1>Billing Management</Text.H1>
          <Text.H4 color='foregroundMuted'>
            Manage billing for workspaces with paying plans. Total:{' '}
            {result.value.length} paying workspaces.
          </Text.H4>
        </div>

        <BillingList workspaces={result.value} />
      </div>
    </div>
  )
}
