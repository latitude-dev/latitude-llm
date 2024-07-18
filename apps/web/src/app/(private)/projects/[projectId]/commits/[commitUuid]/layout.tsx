import { ReactNode } from 'react'

import { CommitProvider } from '@latitude-data/web-ui'
import Sidebar from '$/components/Sidebar'
import { getCommitMergedAt } from '$core/data-access'

export default async function PrivateLayout({
  children,
  params,
}: {
  children: ReactNode
  params: { commitUuid: string; projectId: number }
}) {
  const { commitUuid, projectId } = params
  const commitMergeTime = await getCommitMergedAt({ projectId, commitUuid })
  const isDraft = commitMergeTime.unwrap() === null

  return (
    <CommitProvider commitUuid={commitUuid} isDraft={isDraft}>
      <main className='flex flex-row w-full'>
        <div className='w-[280px]'>
          <Sidebar commitUuid={commitUuid} projectId={projectId} />
        </div>
        <div className='flex-1'>{children}</div>
      </main>
    </CommitProvider>
  )
}
