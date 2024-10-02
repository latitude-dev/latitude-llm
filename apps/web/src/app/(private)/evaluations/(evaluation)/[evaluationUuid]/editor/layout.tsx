import { ReactNode } from 'react'

import { Text } from '@latitude-data/web-ui'
import {
  getEvaluationByUuidCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import BreadcrumbLink from '$/components/BreadcrumbLink'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { EvaluationTabSelector } from '../_components/EvaluationTabs'
import EvaluationEditor from './_components/EvaluationEditor/Editor'

export default async function DocumentPage({
  children,
  params,
}: {
  children: ReactNode
  params: { evaluationUuid: string }
}) {
  const evaluationUuid = params.evaluationUuid
  const evaluation = await getEvaluationByUuidCached(evaluationUuid)
  const session = await getCurrentUser()
  const providerApiKeys = await getProviderApiKeysCached()

  return (
    <AppLayout
      scrollable={false}
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[
        {
          name: session.workspace.name,
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
      <div className='h-full flex flex-col gap-y-4 p-6'>
        <EvaluationTabSelector evaluation={evaluation} />
        <div className='flex-grow'>
          <EvaluationEditor
            providerApiKeys={providerApiKeys}
            evaluationUuid={evaluationUuid}
            defaultPrompt={evaluation.metadata.prompt}
          />
        </div>
        {children}
      </div>
    </AppLayout>
  )
}
