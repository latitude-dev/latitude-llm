'use client'

import { TabSelector } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { useSelectedLayoutSegment } from 'next/navigation'

export function DocumentTabSelector({
  projectId,
  commitUuid,
  documentUuid,
}: {
  documentUuid: string
  projectId: string
  commitUuid: string
}) {
  const router = useNavigate()
  const selectedSegment = useSelectedLayoutSegment() as DocumentRoutes | null

  const pathTo = (documentRoute: DocumentRoutes) => {
    const documentDetail = ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid })

    return documentDetail[documentRoute].root
  }

  return (
    <div className='flex flex-row p-4 pb-0'>
      <TabSelector
        options={[
          { label: 'Editor', value: DocumentRoutes.editor },
          { label: 'Logs', value: DocumentRoutes.logs },
        ]}
        selected={selectedSegment ?? DocumentRoutes.editor}
        onSelect={(value) => {
          router.push(pathTo(value))
        }}
      />
    </div>
  )
}
