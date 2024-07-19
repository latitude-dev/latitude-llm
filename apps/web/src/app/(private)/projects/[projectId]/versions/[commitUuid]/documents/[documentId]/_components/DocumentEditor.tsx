import { useCallback } from 'react'

import { DocumentEditor } from '@latitude-data/web-ui'
import { findCommitByUuid, getDocument } from '$core/data-access'
import { useDebouncedCallback } from 'use-debounce'
import { useServerAction } from 'zsa-react'

export const dynamic = 'force-dynamic'

export default function DocumentEditorWrapper({
  content,
  commitId,
  documentId,
}: {
  content: string
  commitId: number
  documentId: number
}) {
  const { execute } = useServerAction(createDocumentVersionAction)

  const onChange = useDebouncedCallback(
    async ({ content }) => {
      execute({
        parentId: documentId,
        content,
        commitUuid: commitId,
      })
    },
    1000,
    { trailing: true },
  )

  return (
    <div className='w-full h-full relative'>
      <DocumentEditor content={content} onChange={onChange} />
    </div>
  )
}
