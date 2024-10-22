import { Breadcrumb, Icon } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'

import { RootBreadcrumbItems } from './Root'

export function HeaderBreadcrumb() {
  const segments = useSelectedLayoutSegments()

  return (
    <Breadcrumb>
      <Link
        href={ROUTES.dashboard.root}
        className='flex flex-row items-center gap-x-4'
      >
        <Icon name='logo' size='large' />
      </Link>

      <RootBreadcrumbItems segments={segments} />
    </Breadcrumb>
  )
}
