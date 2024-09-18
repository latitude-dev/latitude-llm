import { ReactNode } from 'react'

import { Text } from '@latitude-data/web-ui'
import { getEvaluationByUuidCached } from '$/app/(private)/_data-access'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import BreadcrumbLink from '$/components/BreadcrumbLink'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

export default async function EvaluationLayout({
  params,
  children,
}: {
  params: { evaluationUuid: string }
  children: ReactNode
}) {
  const evaluation = await getEvaluationByUuidCached(params.evaluationUuid)
  const session = await getCurrentUser()

  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[
        {
          name: (
            <BreadcrumbLink
              href={ROUTES.dashboard.root}
              name={session.workspace.name}
            />
          ),
        },
        {
          name: (
            <BreadcrumbLink href={ROUTES.evaluations.root} name='Evaluations' />
          ),
        },
        {
          name: <Text.H5M>{evaluation.name}</Text.H5M>,
        },
      ]}
    >
      {children}
    </AppLayout>
  )
}
