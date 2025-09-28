'use client'

import { AppHeaderWrapper } from '$/components/layouts/AppLayout/Header'
import AvatarDropdown from '$/components/layouts/AppLayout/Header/AvatarDropdown'
import { HeaderBreadcrumb } from '$/components/layouts/AppLayout/Header/Breadcrumb'
import { User } from '@latitude-data/core/schema/types'

export default function NocodersHeader({
  currentUser,
  isCloud,
}: {
  currentUser: User | undefined
  isCloud: boolean
}) {
  return (
    <AppHeaderWrapper>
      <HeaderBreadcrumb />
      <div className='flex flex-row items-center gap-x-6 pl-6'>
        <AvatarDropdown currentUser={currentUser} isCloud={isCloud} />
      </div>
    </AppHeaderWrapper>
  )
}
