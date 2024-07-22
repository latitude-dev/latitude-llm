import { Suspense } from 'react'

import { DocumentSidebar, FilesTree } from '@latitude-data/web-ui'

// FIXME: Mock data
const documents = [
  { path: 'Documents/Intro', doumentUuid: '1' },
  {
    path: 'Documents/Sumaries/Product/Prompts/Coms Summaries',
    doumentUuid: '2',
  },
  {
    path: 'Documents/Sumaries/Product/Prompts/TheBRo',
    doumentUuid: '2bro',
  },
  {
    path: 'Documents/Sumaries/file2',
    doumentUuid: '33',
  },
  {
    path: 'Documents/Sumaries/Product/file3',
    doumentUuid: '43',
  },
  { path: 'Zonboaring/doc5', doumentUuid: '5' },
  { path: 'Onboarding/doc3', doumentUuid: '3' },
  { path: 'P_Bording/Nested/doc4', doumentUuid: '4' },
  { path: 'b_doc_6', doumentUuid: '6' },
  { path: 'a_doc_7', doumentUuid: '7' },
]

export default async function Sidebar() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DocumentSidebar>
        <FilesTree documents={documents} currentDocumentUuid='2' />
      </DocumentSidebar>
    </Suspense>
  )
}
