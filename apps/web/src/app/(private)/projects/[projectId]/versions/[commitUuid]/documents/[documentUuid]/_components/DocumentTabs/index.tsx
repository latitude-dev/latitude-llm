import { ReactNode } from 'react'

import { DocumentTabSelector } from './tabs'

export default function DocumentTabs({
  params,
  children,
}: {
  params: { documentUuid: string; projectId: string; commitUuid: string }
  children: ReactNode
}) {
  return (
    <div className='flex flex-col h-full'>
      <DocumentTabSelector
        projectId={params.projectId}
        commitUuid={params.commitUuid}
        documentUuid={params.documentUuid}
      />
      <div className='flex-grow flex flex-col w-full overflow-hidden'>
        {children}
      </div>
    </div>
  )
}
