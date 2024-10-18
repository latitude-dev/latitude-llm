import { Icon } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'

import { RootBreadcrumbItems } from './Root'

export function Breadcrumb() {
  const segments = useSelectedLayoutSegments()

  return (
    <ul className='flex flex-row flex-grow flex-shrink min-w-0 overflow-hidden items-center gap-x-4'>
      <li>
        <Link
          href={ROUTES.dashboard.root}
          className='flex flex-row items-center gap-x-4'
        >
          <Icon name='logo' size='large' />
        </Link>
      </li>

      <RootBreadcrumbItems segments={segments} />
    </ul>
  )
}
