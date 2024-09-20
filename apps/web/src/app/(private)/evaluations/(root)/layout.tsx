import { ReactNode } from 'react'

import { Text } from '@latitude-data/web-ui'
import { getEvaluationTemplatesCached } from '$/app/(private)/_data-access'
import Evaluations from '$/app/(private)/evaluations/_components/Evaluations'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { NAV_LINKS } from '../../_lib/constants'

export default async function EvaluationsLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getCurrentUser()
  const evaluationTemplates = await getEvaluationTemplatesCached()

  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[
        {
          name: session.workspace.name,
        },
        {
          name: <Text.H5M>Evaluations</Text.H5M>,
        },
      ]}
    >
      <Evaluations evaluationTemplates={evaluationTemplates} />
      {children}
    </AppLayout>
  )
}
