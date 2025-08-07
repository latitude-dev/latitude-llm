import { ROUTES } from '$/services/routes'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Breadcrumb } from '@latitude-data/web-ui/molecules/Breadcrumb'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'

import { RootBreadcrumbItems } from './Root'

export function HeaderBreadcrumb() {
  const segments = useSelectedLayoutSegments()
  const logoElement = <Icon name='logo' size='large' />

  return (
    <Breadcrumb>
      <Link
        href={ROUTES.dashboard.root}
        className='flex flex-row items-center gap-x-4'
      >
        {logoElement}
      </Link>

      <RootBreadcrumbItems segments={segments} />
    </Breadcrumb>
  )
}
