import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import { findCommit } from '$/app/(private)/_data-access'

import Sidebar from './_components/Sidebar'

export const dynamic = 'force-dynamic'

export default async function CommitRoot({
  params,
}: {
  params: { projectId: string; commitUuid: string }
}) {
  const commit = await findCommit({
    projectId: Number(params.projectId),
    uuid: params.commitUuid,
  })
  return (
    <DocumentDetailWrapper>
      <Sidebar commit={commit} />
      <div className='p-32'>Main content. Remove Tailwind Styles from here</div>
    </DocumentDetailWrapper>
  )
}
