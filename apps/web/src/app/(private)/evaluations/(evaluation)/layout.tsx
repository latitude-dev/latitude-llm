import { ReactNode } from 'react'

import { Text } from '@latitude-data/web-ui'
import BreadcrumpLink from '$/components/BreadcrumpLink'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { NAV_LINKS } from '../../_lib/constants'

export default async function EvaluationLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getCurrentUser()
  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[
        {
          name: (
            <BreadcrumpLink
              href={ROUTES.dashboard.root}
              name={session.workspace.name}
            />
          ),
        },
        {
          name: <Text.H5M>Evaluations</Text.H5M>,
        },
      ]}
    >
      {children}
    </AppLayout>
  )
}
